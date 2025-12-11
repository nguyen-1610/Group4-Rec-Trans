import os
import sys
import math
from datetime import datetime

# ==============================================================================
# 1. SETUP & IMPORT
# ==============================================================================
try:
    import cost_estimation
    import real_times
except ImportError:
    try:
        from . import cost_estimation
        from . import real_times
    except ImportError:
        cost_estimation = None
        real_times = None

# ==============================================================================
# 2. CẤU HÌNH (CONSTANTS)
# ==============================================================================
SPEED_CONFIG = {
    'walking': {'normal': 5,  'rush': 5},
    'bus':     {'normal': 25, 'rush': 15},
    'bike':    {'normal': 30, 'rush': 22},
    'car':     {'normal': 25, 'rush': 13}
}

# ==============================================================================
# 3. CLASS DEFINITIONS
# ==============================================================================
class UserRequest:
    def __init__(self, is_student, priorities, budget=None, passenger_count=1):
        self.is_student = is_student
        self.priorities = set(priorities) if priorities else set()
        self.budget = float(budget) if budget and float(budget) > 0 else 10_000_000
        self.passenger_count = int(passenger_count)

class WeatherContext:
    def __init__(self, is_raining=False, is_hot=False, desc=None):
        self.is_raining = is_raining
        self.is_hot = is_hot
        self.desc = desc

# ==============================================================================
# 4. HELPER FUNCTIONS
# ==============================================================================
def is_rush_hour():
    now = datetime.now()
    current_time = now.hour + (now.minute / 60)
    if (7 <= current_time < 9) or (16.5 <= current_time < 18.5):
        return True
    return False

def get_real_weather_context():
    ctx = WeatherContext()
    if 'real_times' in sys.modules and real_times:
        api_key = os.getenv("OPENWEATHER_API_KEY") 
        try:
            data = real_times.fetch_weather_realtime(api_key)
            if data.get("success"):
                ctx.is_raining = data.get("dang_mua", False)
                ctx.is_hot = data.get("nhiet_do", 30) > 35
                ctx.desc = data.get("mo_ta", "")
        except Exception: pass
    return ctx

# ==============================================================================
# 5. MODULE 1: GET MODES
# ==============================================================================
def _get_all_modes(trip_distance):
    modes = []
    # 1. Đi bộ & Bus
    if trip_distance < 3.0: 
        modes.append({'name': 'Đi bộ', 'type': 'walk', 'map_key': 'walking', 'capacity': 1, 'has_roof': False})
    modes.append({'name': 'Xe buýt', 'type': 'bus', 'map_key': 'bus', 'capacity': 50, 'has_roof': True})

    # 2. Xe công nghệ
    if cost_estimation:
        config = cost_estimation.PRICE_CONFIG
        available_services = {} 
        for cfg in config.get("motorbike", {}).values():
            brand = cfg['brand']
            if brand not in available_services: available_services[brand] = set()
            available_services[brand].add('bike')
        for cfg in config.get("car", {}).values():
            brand = cfg['brand']
            seats = cfg.get('seats', 4)
            if brand not in available_services: available_services[brand] = set()
            if seats >= 7: available_services[brand].add('car_7')
            else: available_services[brand].add('car_4')

        for brand, services in available_services.items():
            clean_brand = brand if "bike" not in brand.lower() else brand.split()[0]
            if "xanh" in clean_brand.lower(): clean_brand = "Xanh SM"

            if 'bike' in services:
                modes.append({'name': f"{clean_brand} Bike", 'type': 'bike', 'map_key': 'ride_hailing_bike', 'capacity': 1, 'has_roof': False, 'brand': brand})
            if 'car_4' in services:
                modes.append({'name': f"{clean_brand} Car (4 chỗ)", 'type': 'car', 'map_key': 'ride_hailing_car_4', 'capacity': 4, 'has_roof': True, 'brand': brand})
            if 'car_7' in services:
                modes.append({'name': f"{clean_brand} Car (7 chỗ)", 'type': 'car', 'map_key': 'ride_hailing_car_7', 'capacity': 7, 'has_roof': True, 'brand': brand})
    return modes

# ==============================================================================
# 6. HARD CONSTRAINTS
# ==============================================================================
def _check_hard_constraints(mode, user):
    if mode['type'] == 'bus': return True
    if user.passenger_count > mode['capacity']: return False
    return True

# ==============================================================================
# 7. MODULE 2: CALCULATOR
# ==============================================================================
def _calculate_metrics(mode, user, distance_km, weather_ctx):
    unit_price = 0
    display_str = "0đ"
    
    if cost_estimation and mode['type'] != 'walk':
        res = cost_estimation.calculate_transport_cost(
            mode=mode['map_key'], distance_km=distance_km, is_student=user.is_student,
            is_raining=weather_ctx.is_raining, brand_name=mode.get('brand')
        )
        unit_price = res['value'] if isinstance(res, dict) else float(res)
        display_str = res['display'] if isinstance(res, dict) else f"{int(res):,}đ"

    if mode['type'] == 'bus': total_cost = unit_price * user.passenger_count
    else: total_cost = unit_price 

    price_per_person = total_cost / user.passenger_count if user.passenger_count > 0 else 0

    is_peak = is_rush_hour()
    traffic_mode = 'rush' if is_peak else 'normal'
    speed_key = 'walking' if mode['type'] == 'walk' else mode['type']
    if speed_key not in SPEED_CONFIG: speed_key = 'car' 
    
    speed_kmh = SPEED_CONFIG[speed_key][traffic_mode]
    duration = int((distance_km / max(speed_kmh, 1)) * 60)
    if mode['type'] == 'walk': duration = int((distance_km / 5.0) * 60)

    return {
        "mode": mode, "total_cost": total_cost, "price_per_person": price_per_person,
        "display_str": display_str, "duration": duration, "is_peak": is_peak
    }

# ==============================================================================
# 8. MODULE 3: CHẤM ĐIỂM (BRAND-SPECIFIC LOGIC)
# ==============================================================================
def _compute_score(metrics, user, distance_km, weather_ctx):
    mode = metrics['mode']
    price = metrics['total_cost']
    mode_type = mode['type'] # 'bus', 'bike', 'car', 'walk'
    brand = str(mode.get('brand', '')).lower() # Lấy tên hãng để so sánh
    is_peak = metrics['is_peak']
    
    score = 0.0
    
    # ⭐ 1) PRICE SCORE (THEO BUDGET) - Max 3.0
    price_percent = price / user.budget
    if price_percent < 0.05:      score += 3.0
    elif price_percent < 0.10:    score += 2.5
    elif price_percent < 0.20:    score += 1.8
    elif price_percent < 0.40:    score += 1.0
    else:                         score += 0.2
    
    # ⭐ 2) PRIORITY SCORING (CỤ THỂ TỪNG HÃNG)
    
    # --- A. ƯU TIÊN TỐC ĐỘ (SPEED) ---
    # Logic: Gojek > Grab > Be > Car > Bus
    if 'speed' in user.priorities:
        # Nhóm Bike
        if mode_type == 'bike':
            score += 1.0 # Base cho bike
            if 'gojek' in brand:  score += 0.5  # Gojek nhanh nhất (+1.5 tổng)
            elif 'grab' in brand: score += 0.3  # Grab nhì (+1.3 tổng)
            elif 'be' in brand:   score += 0.1  # Be ba (+1.1 tổng)
        
        # Nhóm Car
        elif mode_type == 'car':
            score += 0.4 # Base cho car
            # Nếu cần nhanh thì Car hơi chậm, nhưng XanhSM/GrabCar thường nhanh hơn Taxi truyền thống
            if 'grab' in brand or 'xanh' in brand: score += 0.1

        # Nhóm chậm
        elif mode_type == 'bus':  score -= 0.6
        elif mode_type == 'walk': score -= 1.0
        
        # Phạt tắc đường
        if is_peak and mode_type == 'car': score -= 0.8
            
    # --- B. ƯU TIÊN RẺ (CHEAP/BUDGET) ---
    # Logic: Be > Bus > Gojek > Grab (Giả định Be hay có mã KM)
    if 'cheap' in user.priorities or 'budget' in user.priorities:
        # Cộng điểm hãng rẻ (Override giá trị tiền một chút vì tâm lý thích brand rẻ)
        if 'be' in brand:      score += 0.8  # Be là vua rẻ
        elif mode_type == 'bus': score += 0.6 # Bus rẻ nhì
        elif 'gojek' in brand: score += 0.4 
        elif 'grab' in brand:  score += 0.2  # Grab thường đắt hơn
        
        # Phạt xe hơi nếu muốn rẻ
        if mode_type == 'car': score -= 0.5
        
    # --- C. ƯU TIÊN THOẢI MÁI (COMFORT) ---
    # Logic: GrabCar > Taxi (XanhSM) > BeCar > Bike
    if 'comfort' in user.priorities:
        if mode_type == 'car':
            score += 1.0 # Base Car
            if 'grab' in brand:     score += 0.5  # GrabCar xịn nhất
            elif 'xanh' in brand:   score += 0.4  # XanhSM xe mới, êm
            elif 'be' in brand:     score += 0.2  # BeCar
        
        elif mode_type == 'bus':  score += 0.3
        elif mode_type == 'bike': score -= 0.8 # Đi xe máy không thoải mái
        elif mode_type == 'walk': score -= 1.0
        
        if is_peak and mode_type == 'car': score -= 0.2 # Kẹt xe giảm comfort tí
        
    # ⭐ 3) THỜI TIẾT (MƯA)
    # Logic: Car > Bus >> Bike
    if weather_ctx.is_raining:
        if mode_type == 'car':    score += 0.5       # Cộng điểm vì quá sướng
        elif mode_type == 'bus':  score -= 0.5       # Trừ nhẹ vì đi bộ ra bến
        elif mode_type == 'bike': score -= 2.5       # Trừ rất nặng (Gojek/Grab/Be đều ướt như nhau)
        elif mode_type == 'walk': score -= 3.0       # Ướt sũng

    # ⭐ 4) KHOẢNG CÁCH & SOLO
    if distance_km > 20:
        if mode_type in ['bike', 'walk']: score -= 1.5
        if mode_type == 'car': score += 0.5

    if user.passenger_count == 1 and mode_type == 'car' and mode['capacity'] >= 7:
        score -= 0.5 

    # Base score
    score += 4.0 

    final_score = max(0.0, min(10.0, score))
    return round(final_score, 1)

# ==============================================================================
# 9. MODULE 4: GÁN NHÃN
# ==============================================================================
def _generate_labels(metrics, score, weather_ctx, distance_km):
    mode = metrics['mode']
    labels = []
    brand_name = str(mode.get('brand', '')).lower()
    
    if metrics['is_peak'] and mode['type'] == 'car': labels.append("🚦 Dễ kẹt")
    if weather_ctx.is_raining and mode['type'] == 'bike': labels.append("🌧️ Mặc áo mưa")
    
    if score >= 8.5: labels.append("⭐ Gợi ý tốt") # Tăng ngưỡng lên tí vì cộng điểm nhiều
    
    # Nhãn Brand đặc trưng
    if 'be' in brand_name: labels.append("💸 Nhiều ưu đãi")
    if 'xanh' in brand_name: labels.append("🌿 Xe điện êm")
    if 'gojek' in brand_name and mode['type'] == 'bike': labels.append("🚀 Tài xế nhanh")
        
    return labels

# ==============================================================================
# 10. MAIN FUNCTION
# ==============================================================================
def calculate_adaptive_scores(user, trip_distance, weather_ctx, traffic_level=0.5):
    modes = _get_all_modes(trip_distance)
    if not modes: return []

    results = []
    for mode in modes:
        if not _check_hard_constraints(mode, user):
            continue 

        metrics = _calculate_metrics(mode, user, trip_distance, weather_ctx)
        score = _compute_score(metrics, user, trip_distance, weather_ctx)
        labels = _generate_labels(metrics, score, weather_ctx, trip_distance)

        results.append({
            "mode_name": metrics['mode']['name'],
            "total_price": int(metrics['total_cost']),
            "price_per_person": int(metrics['price_per_person']),
            "display_price": metrics['display_str'],
            "duration": metrics['duration'],
            "vehicles_needed": 1,
            "score": score,
            "labels": labels,
            "details": { "is_peak": metrics['is_peak'] }
        })

    return sorted(results, key=lambda x: x['score'], reverse=True)