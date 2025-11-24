import sqlite3
import os
import math
import requests

# ==============================================================================
# 1. CẤU HÌNH & DỮ LIỆU (CONFIG & DATA CLASSES)
# ==============================================================================

# Đường dẫn đến database (Tự động tìm file tourism.db ở thư mục cha)
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'tourism.db')

class UserRequest:
    def __init__(self, is_student, priorities):
        self.is_student = is_student        # Boolean: True/False
        self.priorities = priorities        # List: ['saving', 'speed', 'comfort', 'safety']

class WeatherContext:
    def __init__(self, is_raining, is_hot, description):
        self.is_raining = is_raining
        self.is_hot = is_hot
        self.description = description

# ==============================================================================
# 2. MODULE CƠ SỞ DỮ LIỆU (DATABASE LAYER)
# ==============================================================================

def get_modes_with_pricing():
    """
    Lấy dữ liệu phương tiện, bảng giá và hiệu suất từ DB.
    Thực hiện JOIN giữa vehicle_types, pricing tables và performance_profiles.
    """
    modes = []
    try:
        if not os.path.exists(DB_PATH):
            print(f"Lỗi: Không tìm thấy file DB tại {DB_PATH}")
            return []

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # --- QUERY 1: LẤY XE Ô TÔ (CAR) ---
        query_car = """
        SELECT 
            v.type_key as id, 
            v.display_name_vi as name, 
            v.has_roof,
            perf.avg_speed_kmh,
            p.brand, p.base_distance_km, p.base_price, p.min_fare,
            p.per_km_3_12, p.per_km_13_25, p.per_km_26_plus
        FROM vehicle_types v
        JOIN car_pricing p ON v.type_id = p.type_id
        LEFT JOIN performance_profiles perf ON v.type_id = perf.type_id
        WHERE v.is_public = 0
        """
        cursor.execute(query_car)
        for row in cursor.fetchall():
            mode = dict(row)
            mode['category'] = 'car' 
            modes.append(mode)

        # --- QUERY 2: LẤY XE MÁY (BIKE) ---
        query_bike = """
        SELECT 
            v.type_key as id, 
            v.display_name_vi as name, 
            v.has_roof,
            perf.avg_speed_kmh,
            p.brand, p.base_distance_km, p.base_price, p.min_fare,
            p.per_km_after_base, p.time_fee_per_min
        FROM vehicle_types v
        JOIN motorbike_pricing p ON v.type_id = p.type_id
        LEFT JOIN performance_profiles perf ON v.type_id = perf.type_id
        WHERE v.is_public = 0
        """
        cursor.execute(query_bike)
        for row in cursor.fetchall():
            mode = dict(row)
            mode['category'] = 'bike'
            modes.append(mode)
            
        # --- QUERY 3: LẤY XE BUÝT & ĐI BỘ (PUBLIC/ACTIVE) ---
        query_public = """
        SELECT 
            v.type_key as id, 
            v.display_name_vi as name, 
            v.has_roof,
            perf.avg_speed_kmh
        FROM vehicle_types v
        LEFT JOIN performance_profiles perf ON v.type_id = perf.type_id
        WHERE v.is_public = 1 OR v.type_key = 'walking'
        """
        cursor.execute(query_public)
        for row in cursor.fetchall():
            mode = dict(row)
            mode['category'] = 'public' if row['id'] != 'walking' else 'active'
            # Gán giá mặc định cho Bus (hoặc có thể tạo bảng pricing riêng nếu muốn)
            mode['base_price'] = 7000 if 'bus' in row['id'] else 0
            modes.append(mode)

        conn.close()
    except Exception as e:
        print(f"Lỗi đọc DB: {e}")
        return []
    
    return modes

# ==============================================================================
# 3. MODULE TÍNH GIÁ (PRICING ENGINE)
# ==============================================================================

def calculate_car_cost_tiered(mode_data, distance_km, surge):
    """Tính giá ô tô theo bậc thang lũy tiến"""
    total_cost = 0
    dist_remain = distance_km
    
    # 1. Giá mở cửa
    base_dist = mode_data['base_distance_km']
    total_cost += mode_data['base_price']
    
    if distance_km <= base_dist:
        return max(total_cost, mode_data['min_fare']) * surge

    dist_remain -= base_dist

    # 2. Bậc 3-12km (Khoảng 10km)
    tier_1_cap = 10.0 
    if dist_remain > 0:
        km_in_tier = min(dist_remain, tier_1_cap)
        total_cost += km_in_tier * mode_data['per_km_3_12']
        dist_remain -= km_in_tier
        
    # 3. Bậc 13-25km (Khoảng 13km)
    tier_2_cap = 13.0
    if dist_remain > 0:
        km_in_tier = min(dist_remain, tier_2_cap)
        total_cost += km_in_tier * mode_data['per_km_13_25']
        dist_remain -= km_in_tier
        
    # 4. Bậc 26km+
    if dist_remain > 0:
        total_cost += dist_remain * mode_data['per_km_26_plus']

    return max(total_cost, mode_data['min_fare']) * surge

def calculate_bike_cost(mode_data, distance_km, duration_min, surge):
    """Tính giá xe máy: Base + Km thêm + Phí thời gian"""
    total_cost = 0
    
    # 1. Giá mở cửa
    base_dist = mode_data['base_distance_km']
    total_cost += mode_data['base_price']
    
    # 2. Km thêm
    if distance_km > base_dist:
        extra_km = distance_km - base_dist
        total_cost += extra_km * mode_data['per_km_after_base']
        
    # 3. Phí thời gian
    if duration_min:
        total_cost += duration_min * mode_data['time_fee_per_min']
    
    return max(total_cost, mode_data['min_fare']) * surge

# ==============================================================================
# 4. MODULE API THỜI TIẾT & HELPERS
# ==============================================================================

def fetch_weather_context(lat, lon, api_key):
    """Gọi OpenWeatherMap API"""
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={api_key}&units=metric&lang=vi"
    try:
        response = requests.get(url, timeout=3)
        data = response.json()
        if response.status_code != 200: return WeatherContext(False, False, "Không rõ")

        weather_id = data['weather'][0]['id']
        is_raining = True if (200 <= weather_id <= 531) else False
        is_hot = True if data['main']['temp'] > 35 else False
        desc = data['weather'][0]['description']
        
        return WeatherContext(is_raining, is_hot, desc)
    except:
        return WeatherContext(False, False, "Lỗi mạng")

def calculate_surge_multiplier(weather_ctx, traffic_level=0.5, current_hour=9):
    """Tính hệ số tăng giá"""
    surge = 1.0
    if weather_ctx.is_raining: surge += 0.4
    if traffic_level > 0.7: surge += 0.3
    elif traffic_level > 0.4: surge += 0.1
    # Giờ cao điểm giả định
    if (7 <= current_hour <= 9) or (16 <= current_hour <= 19): surge += 0.2
    return min(surge, 3.0)

def get_dynamic_thresholds(user):
    """Đoán ngân sách tâm lý"""
    ref_cost, ref_time = 100000.0, 45.0 # Mốc chuẩn
    
    if user.is_student: ref_cost *= 0.5
    
    if 'saving' in user.priorities: ref_cost *= 0.7; ref_time *= 1.3
    if 'speed' in user.priorities: ref_time *= 0.6
    if 'comfort' in user.priorities: ref_cost *= 1.5
    
    return ref_cost, ref_time

def calculate_weights(priorities):
    """Tính trọng số ưu tiên"""
    weights = {'cost': 0.25, 'time': 0.25, 'safety': 0.25, 'weather': 0.25}
    BOOST = 0.3
    if 'saving' in priorities: weights['cost'] += BOOST
    if 'speed' in priorities: weights['time'] += BOOST
    if 'safety' in priorities: weights['safety'] += BOOST
    if 'comfort' in priorities: weights['weather'] += BOOST
    
    total = sum(weights.values())
    return {k: v/total for k, v in weights.items()}

# ==============================================================================
# 5. THUẬT TOÁN GỢI Ý CHÍNH (MAIN RECOMMENDATION ENGINE)
# ==============================================================================

def calculate_adaptive_scores(user, trip_distance, weather_ctx, traffic_level=0.5):
    
    # 1. Lấy dữ liệu từ DB
    modes = get_modes_with_pricing()
    if not modes: return [] # Trả về rỗng nếu lỗi DB
    
    # 2. Chuẩn bị tham số môi trường
    surge = calculate_surge_multiplier(weather_ctx, traffic_level)
    weights = calculate_weights(user.priorities)
    ref_cost, ref_time = get_dynamic_thresholds(user)
    
    results = []
    
    for mode in modes:
        # --- A. TÍNH THỜI GIAN ---
        # Lấy tốc độ từ DB (nếu null thì mặc định 30)
        avg_speed = mode.get('avg_speed_kmh') or 30.0
        
        # Giảm tốc độ nếu kẹt xe (Xe máy lách tốt hơn ô tô)
        impact = traffic_level
        if mode.get('category') == 'bike': impact *= 0.6 
        
        real_speed = avg_speed * (1.0 - (impact * 0.5)) # Giả sử kẹt xe max làm giảm 50% tốc độ
        duration_min = (trip_distance / real_speed) * 60
        
        # --- B. TÍNH GIÁ ---
        final_price = 0
        
        if mode['category'] == 'car':
            final_price = calculate_car_cost_tiered(mode, trip_distance, surge)
            
        elif mode['category'] == 'bike':
            final_price = calculate_bike_cost(mode, trip_distance, duration_min, surge)
            
        elif 'bus' in mode['id']:
            final_price = 3000 if user.is_student else mode['base_price']
            
        elif mode['id'] == 'walking':
            final_price = 0
            
        # --- C. TÍNH ĐIỂM (SCORING) ---
        
        # 1. Điểm Giá & Thời gian (Dựa trên ngưỡng động)
        s_cost = 10 * (ref_cost / (ref_cost + final_price)) if final_price > 0 else 10
        s_time = 10 * (ref_time / (ref_time + duration_min))
        
        # 2. Điểm Thời tiết (Phạt nặng nếu Mưa/Nắng gắt)
        s_weather = 10
        if weather_ctx.is_raining:
            if not mode['has_roof']: s_weather = 1.0 # Ướt
        elif weather_ctx.is_hot:
            if mode['id'] == 'walking': s_weather = 2.0
            if mode['category'] == 'bike': s_weather = 6.0
            
        # 3. Điểm An toàn (Cơ bản 10, trừ nếu kẹt xe/xe máy)
        s_safety = 10
        if mode['category'] == 'bike': s_safety = 7.0
        if traffic_level > 0.7 and mode['category'] == 'bike': s_safety -= 2.0
        
        # --- D. XỬ LÝ MÂU THUẪN & NHÃN ---
        labels = []
        explanation = ""
        
        # Logic Nhãn
        if s_cost > 8.0: labels.append("💰 Siêu Rẻ")
        if s_time > 8.0: labels.append("⚡ Nhanh")
        if s_weather > 8.0 and mode['has_roof']: labels.append("❄️ Mát mẻ")
        
        # Logic Giải thích (Reasoning)
        bonus = 0
        is_conflicted = ('saving' in user.priorities) and ('comfort' in user.priorities)
        
        if is_conflicted:
            if 'bus' in mode['id']:
                bonus += 0.5
                explanation = "Cân bằng tốt nhất giữa Rẻ và Mát mẻ."
            elif mode['category'] == 'car':
                explanation = "Thỏa mãn Thoải mái, nhưng giá cao hơn mức Tiết kiệm."
                
        # --- E. TỔNG HỢP ---
        final_score = (
            (s_cost * weights['cost']) + 
            (s_time * weights['time']) + 
            (s_safety * weights['safety']) + 
            (s_weather * weights['weather'])
        ) + bonus
        
        results.append({
            "mode_name": mode['name'],
            "brand": mode.get('brand', ''), # Xanh SM, Grab...
            "price": int(final_price),
            "duration": int(duration_min),
            "score": round(final_score, 2),
            "labels": labels,
            "note": explanation
        })
        
    # Sắp xếp
    return sorted(results, key=lambda x: x['score'], reverse=True)
