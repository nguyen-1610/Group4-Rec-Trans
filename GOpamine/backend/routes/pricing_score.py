import sqlite3
import os
import sys

# ==============================================================================
# PHẦN 1: CẤU HÌNH IMPORT & ĐƯỜNG DẪN (ĐÃ SỬA)
# ==============================================================================

# Import các module cùng thư mục một cách an toàn
try:
    import cost_estimation
    import real_times
except ImportError:
    from . import cost_estimation
    from . import real_times

# Đường dẫn DB (Leo ra ngoài 2 cấp để tìm folder database)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(CURRENT_DIR, '../../database/vehicle.db'))

# ==============================================================================
# PHẦN 2: DATA CLASSES (SỬA LẠI CHO KHỚP SỐ LƯỢNG THAM SỐ)
# ==============================================================================
class UserRequest:
    def __init__(self, is_student, priorities):
        self.is_student = is_student
        self.priorities = priorities

class WeatherContext:
    # Thêm giá trị mặc định để tránh lỗi "arguments mismatch"
    def __init__(self, is_raining=False, is_hot=False):
        self.is_raining = is_raining
        self.is_hot = is_hot

# ==============================================================================
# PHẦN 3: CÁC HÀM HỖ TRỢ (SỬA ĐƯỜNG DẪN DB)
# ==============================================================================

def get_real_weather_context():
    """Gọi API thật để lấy dữ liệu"""
    is_raining = False
    is_hot = False

    # Kiểm tra xem module real_times có tồn tại không
    if 'real_times' in sys.modules and real_times:
        api_key = os.getenv("OPENWEATHER_API_KEY") 
        try:
            weather_data = real_times.fetch_weather_realtime(api_key)
            if weather_data.get("success"):
                is_raining = weather_data.get("dang_mua", False)
                temp = weather_data.get("nhiet_do", 30)
                is_hot = True if temp > 35 else False
                print(f"[INFO] Thoi tiet: {temp}C | Mua: {is_raining}")
            else:
                print(f"[WARN] API Thoi tiet loi: {weather_data.get('error')}")
        except Exception as e:
            print(f"[WARN] Loi module weather: {e}")
    else:
        print("[INFO] Khong co module real_times, dung gia dinh.")
    
    return WeatherContext(is_raining, is_hot)

def get_modes_from_db():
    modes = []
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] Khong tim thay DB tai: {DB_PATH}")
        return []

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        rows = cursor.execute("SELECT type_key, display_name_vi as name, has_roof FROM vehicle_types").fetchall()
        
        for row in rows:
            mode = dict(row)
            # Mapping key (Logic của bạn)
            if mode['type_key'] == 'walk':
                mode['map_key'] = 'walking'
                mode['speed'] = 5
            elif 'bus' in mode['type_key']:
                mode['map_key'] = 'bus'
                mode['speed'] = 20
            elif 'motorbike' in mode['type_key'] or 'bike' in mode['type_key']:
                mode['map_key'] = 'ride_hailing_bike'
                mode['speed'] = 30
            elif 'car' in mode['type_key'] or 'taxi' in mode['type_key']:
                mode['map_key'] = 'ride_hailing_car'
                mode['speed'] = 40
            else:
                mode['map_key'] = None
                mode['speed'] = 20
            
            if mode['map_key']: modes.append(mode)
        conn.close()
    except Exception as e:
        print(f"[ERROR] Loi DB Pricing: {e}")
        return []
    return modes

# ==============================================================================
# PHẦN 4: THUẬT TOÁN CHÍNH (GIỮ NGUYÊN CỦA BẠN 100%)
# ==============================================================================

def calculate_weights(priorities):
    weights = {'cost': 0.25, 'time': 0.25, 'safety': 0.25, 'weather': 0.25}
    BOOST = 0.4
    if 'saving' in priorities: weights['cost'] += BOOST
    if 'speed' in priorities: weights['time'] += BOOST
    if 'safety' in priorities: weights['safety'] += BOOST
    if 'comfort' in priorities: weights['weather'] += BOOST
    total = sum(weights.values())
    return {k: v/total for k, v in weights.items()}

def calculate_adaptive_scores(user, trip_distance, weather_ctx, traffic_level=0.5):
    modes = get_modes_from_db()
    if not modes: return []

    weights = calculate_weights(user.priorities)
    ref_cost = 50000.0 if user.is_student else 100000.0
    ref_time = 45.0

    results = []
    for mode in modes:
        # A. TÍNH TIỀN
        # Mặc định
        cost_result = {'value': 0, 'display': '0VND'}
        
        if cost_estimation:
            # Gọi hàm (hàm này giờ trả về Dict)
            result_data = cost_estimation.calculate_transport_cost(
                mode=mode['map_key'],
                distance_km=trip_distance,
                is_student=user.is_student,
                is_raining=weather_ctx.is_raining
            )
            
            # Kiểm tra nếu trả về Dict thì gán vào, nếu trả về Int (phòng hờ) thì tự format
            if isinstance(result_data, dict):
                cost_result = result_data
            else:
                # Fallback nếu lỡ hàm trả về số
                val = int(result_data)
                cost_result = {
                    'value': val,
                    'display': f"{val:,}VND"
                }

        final_price = cost_result['value']
        
        # B. Tính thời gian
        real_speed = mode['speed']
        if 'bike' in mode['map_key']: real_speed *= (1 - traffic_level * 0.3)
        else: real_speed *= (1 - traffic_level * 0.6)
        duration_min = (trip_distance / max(real_speed, 1)) * 60

        # C. Chấm điểm
        s_cost = 10 * (ref_cost / (ref_cost + final_price)) if final_price > 0 else 10
        s_time = 10 * (ref_time / (ref_time + duration_min))
        
        s_weather = 10
        s_safety = 10
        
        if weather_ctx.is_raining and not mode['has_roof']: s_weather = 2.0
        if weather_ctx.is_hot and mode['type_key'] == 'walk': s_weather = 4.0
        if traffic_level > 0.7 and 'bike' in mode['map_key']: s_safety = 7.0
            
        final_score = (
            (s_cost * weights['cost']) +
            (s_time * weights['time']) +
            (s_weather * weights['weather']) +
            (s_safety * weights['safety'])
        )

        labels = []
        if s_cost > 7.5: labels.append("Tiết kiệm")      
        if s_time > 8.0: labels.append("Nhanh nhất")     
        if s_weather > 9.0 and weather_ctx.is_raining: labels.append("Che mưa tốt") 

        results.append({
            "mode_name": mode['name'],
            "price_value": final_price,
            "display_price": cost_result['display'], # Giờ nó sẽ là "~15,000VND"
            "duration": int(duration_min),
            "score": round(final_score, 1),
            "labels": labels
        })

    return sorted(results, key=lambda x: x['score'], reverse=True)