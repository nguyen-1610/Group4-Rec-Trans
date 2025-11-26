import sqlite3
import os
import sys

# --- IMPORT MODULE ĐỒNG ĐỘI ---
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

# A. Import Cost Estimation (Kế toán)
try:
    import cost_estimation
except ImportError:
    cost_estimation = None
    print("[WARN] Khong tim thay module: cost_estimation.py")

# B. Import Real Times (Thời tiết)
real_times = None 
try:
    import real_times
    print("[INFO] Da load module: real_times")
except ImportError:
    print("[WARN] Khong tim thay module: real_times.py")
    real_times = None

# --- 2. CẤU HÌNH DATABASE ---
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(current_dir)), 'backend', 'data', 'vehicle.db')
if not os.path.exists(DB_PATH):
    DB_PATH = os.path.join(current_dir, '../data/vehicle.db')

# --- 3. DATA CLASSES ---
class UserRequest:
    def __init__(self, is_student, priorities):
        self.is_student = is_student
        self.priorities = priorities

class WeatherContext:
    def __init__(self, is_raining, is_hot):
        self.is_raining = is_raining
        self.is_hot = is_hot

# --- 4. HÀM LẤY THỜI TIẾT THẬT ---
def get_real_weather_context():
    """Gọi API thật để lấy dữ liệu"""
    is_raining = False
    is_hot = False

    if real_times:
        api_key = os.getenv("OPENWEATHER_API_KEY") 
        weather_data = real_times.fetch_weather_realtime(api_key)
        
        if weather_data.get("success"):
            is_raining = weather_data.get("dang_mua", False)
            temp = weather_data.get("nhiet_do", 30)
            is_hot = True if temp > 35 else False
            print(f"[INFO] Thoi tiet thuc te: {temp}C | Mua: {is_raining}")
        else:
            print(f"[ERROR] API Thoi tiet loi: {weather_data.get('error')}")
    else:
        print("[INFO] Khong co module real_times, su dung du lieu gia dinh.")
    
    return WeatherContext(is_raining, is_hot)

# --- 5. HÀM LẤY DỮ LIỆU XE TỪ DB ---
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
            # Mapping key
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
        print(f"[ERROR] Loi DB: {e}")
        return []
    return modes

# --- 6. HÀM TÍNH TRỌNG SỐ ---
def calculate_weights(priorities):
    weights = {'cost': 0.25, 'time': 0.25, 'safety': 0.25, 'weather': 0.25}
    BOOST = 0.4
    if 'saving' in priorities: weights['cost'] += BOOST
    if 'speed' in priorities: weights['time'] += BOOST
    if 'safety' in priorities: weights['safety'] += BOOST
    if 'comfort' in priorities: weights['weather'] += BOOST
    total = sum(weights.values())
    return {k: v/total for k, v in weights.items()}

# --- 7. CORE LOGIC: CHẤM ĐIỂM ---
def calculate_adaptive_scores(user, trip_distance, weather_ctx, traffic_level=0.5):
    modes = get_modes_from_db()
    if not modes: return []

    weights = calculate_weights(user.priorities)
    ref_cost = 50000.0 if user.is_student else 100000.0
    ref_time = 45.0

    results = []
    for mode in modes:
        # A. Tính tiền
        cost_result = {'value': 0, 'display': '0VND'}
        if cost_estimation:
            cost_result = cost_estimation.calculate_transport_cost(
                mode=mode['map_key'],
                distance_km=trip_distance,
                is_student=user.is_student,
                is_raining=weather_ctx.is_raining
            )
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
        if s_cost > 7.5: labels.append("Tiết kiệm")      # Cũ: Tiet kiem
        if s_time > 8.0: labels.append("Nhanh nhất")     # Cũ: Nhanh
        if s_weather > 9.0 and weather_ctx.is_raining: labels.append("Che mưa tốt") # Cũ: Che mua

        results.append({
            "mode_name": mode['name'],
            "price_value": final_price,
            "display_price": cost_result['display'],
            "duration": int(duration_min),
            "score": round(final_score, 1),
            "labels": labels
        })

    return sorted(results, key=lambda x: x['score'], reverse=True)
# ==============================================================================