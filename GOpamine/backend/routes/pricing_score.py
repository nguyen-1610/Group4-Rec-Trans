import os
import sys

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
# 2. DATA MODELS
# ==============================================================================
class UserRequest:
    def __init__(self, is_student, priorities):
        self.is_student = is_student
        self.priorities = priorities

class WeatherContext:
    def __init__(self, is_raining=False, is_hot=False):
        self.is_raining = is_raining
        self.is_hot = is_hot

def get_real_weather_context():
    """Lấy dữ liệu thời tiết từ API Realtime."""
    is_raining = False
    is_hot = False

    if 'real_times' in sys.modules and real_times:
        api_key = os.getenv("OPENWEATHER_API_KEY") 
        try:
            data = real_times.fetch_weather_realtime(api_key)
            if data.get("success"):
                is_raining = data.get("dang_mua", False)
                temp = data.get("nhiet_do", 30)
                is_hot = temp > 35
        except Exception as e:
            print(f"⚠️ Lỗi Weather API: {e}")
    
    return WeatherContext(is_raining, is_hot)

def calculate_weights(priorities):
    """Tính trọng số ưu tiên của người dùng."""
    weights = {'cost': 0.25, 'time': 0.25, 'safety': 0.25, 'weather': 0.25}
    BOOST = 0.4
    
    if 'saving' in priorities: weights['cost'] += BOOST
    if 'speed' in priorities: weights['time'] += BOOST
    if 'safety' in priorities: weights['safety'] += BOOST
    if 'comfort' in priorities: weights['weather'] += BOOST
    
    total = sum(weights.values())
    return {k: v/total for k, v in weights.items()}

# ==============================================================================
# 3. CORE LOGIC: TÍNH ĐIỂM & GỢI Ý
# ==============================================================================
def calculate_adaptive_scores(user, trip_distance, weather_ctx, traffic_level=0.5):
    
    # 1. Tạo danh sách các phương tiện cần so sánh
    modes = []
    
    # A. Phương tiện cơ bản
    modes.append({'name': 'Đi bộ', 'map_key': 'walking', 'speed': 5, 'has_roof': False, 'brand': None})
    modes.append({'name': 'Xe buýt', 'map_key': 'bus', 'speed': 20, 'has_roof': True, 'brand': None})

    # B. Phương tiện từ Database (Tự động sinh ra theo Hãng)
    if cost_estimation:
        config = cost_estimation.PRICE_CONFIG
        
        # Xe máy: Lấy danh sách các Hãng duy nhất
        bike_brands = {cfg['brand'] for cfg in config.get("motorbike", {}).values()}
        for brand in bike_brands:
            modes.append({
                'name': f"{brand} Bike (Gói cước)", 
                'map_key': 'ride_hailing_bike',
                'speed': 30,
                'has_roof': False,
                'brand': brand
            })

        # Ô tô: Lấy danh sách các Hãng duy nhất
        car_brands = {cfg['brand'] for cfg in config.get("car", {}).values()}
        for brand in car_brands:
            modes.append({
                'name': f"{brand} Car (4/7 chỗ)",
                'map_key': 'ride_hailing_car',
                'speed': 35,
                'has_roof': True,
                'brand': brand
            })

    # 2. Tính toán chi tiết cho từng phương tiện
    weights = calculate_weights(user.priorities)
    ref_cost = 50000.0 
    ref_time = 45.0
    results = []

    for mode in modes:
        # A. Tính Tiền
        cost_display = '0đ'
        avg_price = 0
        
        if cost_estimation:
            res = cost_estimation.calculate_transport_cost(
                mode=mode['map_key'],
                distance_km=trip_distance,
                is_student=user.is_student,
                is_raining=weather_ctx.is_raining,
                brand_name=mode.get('brand')
            )
            if isinstance(res, dict): 
                avg_price = res['value']
                cost_display = res['display']
            else: 
                avg_price = int(res)
                cost_display = f"{res}VND"

        # B. Tính Thời Gian
        real_speed = mode['speed']
        # Giảm tốc độ nếu tắc đường
        if 'bike' in mode['map_key']: real_speed *= (1 - traffic_level * 0.2)
        else: real_speed *= (1 - traffic_level * 0.5) # Ô tô bị kẹt nặng hơn
        
        duration_min = int((trip_distance / max(real_speed, 1)) * 60)

        # C. Tính Điểm Số (AI Score)
        s_cost = 10 * (ref_cost / (ref_cost + avg_price)) if avg_price > 0 else 10
        s_time = 10 * (ref_time / (ref_time + duration_min))
        s_weather = 10
        s_safety = 10
        
        # Phạt điểm thời tiết/an toàn
        if weather_ctx.is_raining and not mode['has_roof']: s_weather = 2.0
        if weather_ctx.is_hot and mode['map_key'] == 'walking': s_weather = 4.0
        
        final_score = (s_cost * weights['cost']) + (s_time * weights['time']) + \
                      (s_weather * weights['weather']) + (s_safety * weights['safety'])

        # Gán Nhãn (Tags)
        labels = []
        if s_cost > 8.0: labels.append("Rẻ")
        if s_time > 8.5: labels.append("Nhanh")
        if mode.get('brand') and 'xanh' in mode.get('brand', '').lower(): labels.append("Xe điện")

        results.append({
            "mode_name": mode['name'],
            "price_value": avg_price,
            "display_price": cost_display,
            "duration": duration_min,
            "score": round(final_score, 1),
            "labels": labels
        })

    # Sắp xếp kết quả: Điểm cao nhất lên đầu
    return sorted(results, key=lambda x: x['score'], reverse=True)