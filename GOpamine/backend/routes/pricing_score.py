import os
import sys
import math

# ==============================================================================
# 1. SETUP & IMPORT
# ==============================================================================
try:
    import cost_estimation
    import real_times
except ImportError:
    from . import cost_estimation
    from . import real_times

# ==============================================================================
# 2. CẤU HÌNH & HẰNG SỐ
# ==============================================================================
BENCHMARK_CAR_BASE_FARE = 20000        
BENCHMARK_CAR_4_KM = 14000             
BENCHMARK_CAR_7_KM = 17000             
REF_TIME_MIN = 30           
WALKING_MAX_KM = 5.0        

class UserRequest:
    def __init__(self, is_student, priorities, budget=None, passenger_count=1):
        self.is_student = is_student
        self.priorities = priorities 
        self.budget = float(budget) if budget else float('inf')
        self.passenger_count = int(passenger_count)

class WeatherContext:
    def __init__(self, is_raining=False, is_hot=False, desc=None):
        self.is_raining = is_raining
        self.is_hot = is_hot
        self.desc = desc

# ==============================================================================
# 3. HELPER FUNCTIONS
# ==============================================================================

def get_real_weather_context():
    ctx = WeatherContext()
    if 'real_times' in sys.modules and real_times:
        api_key = os.getenv("OPENWEATHER_API_KEY") 
        try:
            data = real_times.fetch_weather_realtime(api_key)
            if data.get("success"):
                ctx.is_raining = data.get("dang_mua", False)
                ctx.is_hot = data.get("nhiet_do", 30) > 35
        except Exception as e:
            print(f"⚠️ Weather API Error: {e}")
    return ctx

def get_benchmark_car_cost(distance_km, passengers):
    base_cost_4 = BENCHMARK_CAR_BASE_FARE + (distance_km * BENCHMARK_CAR_4_KM)
    base_cost_7 = BENCHMARK_CAR_BASE_FARE + (distance_km * BENCHMARK_CAR_7_KM)
    if passengers <= 4: return base_cost_4
    elif passengers <= 7: return base_cost_7
    else: return base_cost_4 * math.ceil(passengers / 4)

def calculate_adaptive_weights(priorities, passenger_count):
    """
    [LOGIC MỚI] Điều chỉnh trọng số thông minh theo số lượng khách.
    """
    points = {'cost': 1.0, 'time': 1.0, 'comfort': 1.0, 'safety': 1.0}

    # 1. User Priority: Cộng 3 điểm (như cũ)
    if 'saving' in priorities:  points['cost'] += 3.0
    if 'speed' in priorities:   points['time'] += 3.0
    if 'safety' in priorities:  points['safety'] += 3.0
    if 'comfort' in priorities: points['comfort'] += 3.0

    # 2. [THAY ĐỔI] Ngữ cảnh Số lượng khách
    if passenger_count == 1:
        # Đi 1 mình: Giá và Tốc độ quan trọng hơn Tiện nghi
        points['cost'] += 1.5
        points['time'] += 1.5
        # Giảm bớt sự quan trọng của Comfort/Safety (trừ khi user chọn ưu tiên)
        # Vì đi 1 mình thường chấp nhận cực chút để nhanh/rẻ
    
    elif passenger_count >= 3:
        # Đi đông: Tiện nghi & An toàn cực quan trọng
        points['comfort'] += 2.0 
        points['safety'] += 1.0
        points['cost'] -= 0.5 # Chấp nhận đắt chút để đi chung

    total_points = sum(points.values())
    return {k: v / total_points for k, v in points.items()}

# ==============================================================================
# 4. SCORING FUNCTIONS
# ==============================================================================

def calculate_price_score(actual_price, user_budget):
    if actual_price == 0: return 10.0
    ref_budget = user_budget if user_budget < float('inf') else 500000

    if actual_price <= ref_budget * 0.5: return 10.0
    elif actual_price <= ref_budget:
        ratio = (actual_price - (ref_budget * 0.5)) / (ref_budget * 0.5)
        return 10.0 - (ratio * 4.0) 
    else:
        over_ratio = (actual_price - ref_budget) / ref_budget
        return max(0.0, 6.0 - (over_ratio * 10.0))

def calculate_time_score(duration_min):
    if duration_min <= 15: return 10.0
    if duration_min <= 45:
        ratio = (duration_min - 15) / 30
        return 10.0 - (ratio * 5.0)
    return max(1.0, 5.0 - ((duration_min - 45) / 10))

def calculate_comfort_score(mode, weather_ctx, vehicles_needed, distance_km, passenger_count):
    """
    [LOGIC MỚI] Tiện nghi phụ thuộc vào quãng đường và số người.
    """
    score = 10.0
    
    # 1. Phạt thời tiết (giữ nguyên)
    if weather_ctx.is_raining and not mode['has_roof']: score -= 6.0
    if weather_ctx.is_hot and mode['map_key'] == 'walking': score -= 7.0
    
    # 2. Phạt số lượng xe (cho nhóm)
    if vehicles_needed > 1 and mode['map_key'] != 'bus':
        score -= (vehicles_needed - 1) * 3.0 # Phạt nặng hơn: book 2 xe rất phiền
    
    # 3. [MỚI] Phạt xe máy đi đường dài
    if 'bike' in mode['map_key']:
        if distance_km > 15: score -= 4.0 # Đi xe máy > 15km khá mệt
        elif distance_km > 8: score -= 2.0
        # Nếu đi < 8km thì xe máy vẫn thoải mái, không trừ điểm

    # 4. [MỚI] Đi ô tô 1 mình cự ly ngắn -> Trừ nhẹ điểm "thừa thãi"
    if 'car' in mode['map_key'] and passenger_count == 1 and distance_km < 3:
        score -= 1.0 

    return max(0.0, score)

def calculate_safety_score(mode, user_passengers, mode_capacity, distance_km):
    """
    [LOGIC MỚI] Xe máy chỉ bị trừ điểm an toàn nặng nếu đi xa.
    """
    score = 10.0
    
    # Xe máy
    if 'bike' in mode['map_key']:
        if distance_km > 10: 
            score -= 3.0 # Đi xa mới sợ nguy hiểm
        else:
            score -= 1.0 # Đi gần trong phố thì xe máy chấp nhận được, chỉ trừ nhẹ
            
    # Quá tải
    if user_passengers > mode_capacity: score -= 5.0
    
    return max(0.0, score)

# ==============================================================================
# 5. MAIN LOGIC
# ==============================================================================

def calculate_adaptive_scores(user, trip_distance, weather_ctx, traffic_level=0.5):
    
    # --- BƯỚC 1: TẠO DANH SÁCH MODE XE ---
    modes = []
    if trip_distance < 3.0: 
        modes.append({'name': 'Đi bộ', 'map_key': 'walking', 'speed': 5, 'has_roof': False, 'brand': None, 'capacity': 1})
    modes.append({'name': 'Xe buýt', 'map_key': 'bus', 'speed': 20, 'has_roof': True, 'brand': None, 'capacity': 50})

    if cost_estimation:
        config = cost_estimation.PRICE_CONFIG
        bike_brands = set(cfg['brand'] for cfg in config.get("motorbike", {}).values())
        for brand in bike_brands:
            clean_name = brand if "bike" in str(brand).lower() else f"{brand} Bike"
            modes.append({'name': clean_name, 'map_key': 'ride_hailing_bike', 'speed': 30, 'has_roof': False, 'brand': brand, 'capacity': 1})

        car_brands = set(cfg['brand'] for cfg in config.get("car", {}).values())
        for brand in car_brands:
            clean_name = brand if "car" in str(brand).lower() else f"{brand} Car"
            modes.append({'name': f"{clean_name} (4 chỗ)", 'map_key': 'ride_hailing_car_4', 'speed': 35, 'has_roof': True, 'brand': brand, 'capacity': 4})
            modes.append({'name': f"{clean_name} (7 chỗ)", 'map_key': 'ride_hailing_car_7', 'speed': 35, 'has_roof': True, 'brand': brand, 'capacity': 7})

    # --- BƯỚC 2: CHUẨN BỊ ---
    benchmark_cost = get_benchmark_car_cost(trip_distance, user.passenger_count)
    weights = calculate_adaptive_weights(user.priorities, user.passenger_count)
    results = []

    # --- BƯỚC 3: TÍNH TOÁN ---
    for mode in modes:
        is_public = mode['map_key'] in ['bus', 'walking']
        vehicles_needed = 1 if is_public else math.ceil(user.passenger_count / mode['capacity'])

        # Lấy giá
        unit_price = 0
        display_str = "0đ"
        if cost_estimation:
            res = cost_estimation.calculate_transport_cost(
                mode=mode['map_key'],
                distance_km=trip_distance,
                is_student=user.is_student,
                is_raining=weather_ctx.is_raining,
                brand_name=mode.get('brand')
            )
            unit_price = res['value'] if isinstance(res, dict) else float(res)
            display_str = res['display'] if isinstance(res, dict) else f"{int(res):,}đ"

        if is_public: total_cost = unit_price * user.passenger_count
        else: total_cost = unit_price * vehicles_needed
        
        price_per_person = total_cost / user.passenger_count if user.passenger_count > 0 else 0

        # Thời gian
        real_speed = mode['speed']
        traffic_penalty = 0.2 if 'bike' in mode['map_key'] else 0.5
        real_speed *= (1 - traffic_level * traffic_penalty)
        duration = int((trip_distance / max(real_speed, 1)) * 60)
        if mode['map_key'] == 'walking': duration = int((trip_distance / 5.0) * 60)

        # --- CHẤM ĐIỂM (UPDATED) ---
        s_price = calculate_price_score(total_cost, user.budget)
        
        if mode['map_key'] == 'walking':
            s_time = 10.0 if trip_distance <= 1.5 else (7.0 if trip_distance <= 3.0 else 1.0)
        else:
            s_time = calculate_time_score(duration)
        
        # [UPDATED] Truyền thêm distance và passenger_count
        s_comfort = calculate_comfort_score(mode, weather_ctx, vehicles_needed, trip_distance, user.passenger_count)
        s_safety = calculate_safety_score(mode, user.passenger_count, mode['capacity'], trip_distance)

        # Weighted Sum
        base_score = (
            (s_price * weights['cost']) +
            (s_time * weights['time']) +
            (s_comfort * weights['comfort']) +
            (s_safety * weights['safety'])
        )

        # Penalty chéo (Chỉ phạt xe máy nếu đi nhóm > 1)
        penalty = 0
        if 'bike' in mode['map_key'] and user.passenger_count > 1:
            if total_cost > benchmark_cost: penalty += 4.0
            else: penalty += 1.5 # Phạt vì book nhiều xe

        final_score = min(10.0, max(0.1, base_score - penalty))

        # Labels
        labels = []
        if s_price >= 9.0: labels.append("💰 Rẻ")
        if s_time >= 9.0: labels.append("🚀 Nhanh")
        if vehicles_needed > 1 and not is_public: labels.append(f"🚗 {vehicles_needed} xe")
        if total_cost > user.budget: 
            over = int(total_cost - user.budget)
            labels.append(f"⚠️ Vượt {over//1000}k")
        if mode.get('brand') and 'xanh' in str(mode.get('brand')).lower(): labels.append("🌱 Xe điện")
        if user.passenger_count > mode['capacity'] and not is_public: labels.append("❌ Quá tải")

        # Format Name
        display_name = mode['name']
        if vehicles_needed > 1 and not is_public:
            display_name = f"{mode['name']} (x{vehicles_needed})"
            display_str = f"{int(total_cost):,}đ"

        results.append({
            "mode_name": display_name,
            "total_price": int(total_cost),
            "price_per_person": int(price_per_person),
            "display_price": display_str,
            "duration": duration,
            "vehicles_needed": vehicles_needed,
            "score": round(final_score, 2),
            "details": {
                "p_score": round(s_price, 2),
                "t_score": round(s_time, 2),
                "c_score": round(s_comfort, 2),
                "s_score": round(s_safety, 2),
                "weights": {k: round(v, 2) for k, v in weights.items()}
            },
            "labels": labels
        })

    return sorted(results, key=lambda x: x['score'], reverse=True)