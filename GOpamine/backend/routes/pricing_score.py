import sqlite3
import os
import sys
import requests
from types import ModuleType # <--- Cần cái này để tạo module giả

# ==============================================================================
# 1. VÁ LỖI (HOTFIX) CHO MODULE ĐỒNG ĐỘI
# ==============================================================================
# Mục tiêu: Đánh lừa cost_estimation.py rằng 'utils.database' đang tồn tại.
# Nếu không làm bước này, dòng 'from utils.database...' bên kia sẽ gây crash.

# 1. Tạo module cha 'utils' giả
if 'utils' not in sys.modules:
    mock_utils = ModuleType('utils')
    sys.modules['utils'] = mock_utils

# 2. Tạo module con 'utils.database' giả
if 'utils.database' not in sys.modules:
    mock_database = ModuleType('utils.database')
    
    # Tạo hàm giả trả về None -> Để cost_estimation dùng giá mặc định (backup)
    def mock_get_price_config():
        print("⚠️ [System] Đang dùng hàm giả lập cho get_price_config")
        return None 
    
    mock_database.get_price_config = mock_get_price_config
    
    # Gắn vào hệ thống
    sys.modules['utils.database'] = mock_database
    # Gắn vào module cha
    sys.modules['utils'].database = mock_database

# ==============================================================================
# 2. IMPORT MODULE ĐỒNG ĐỘI
# ==============================================================================
# Lấy đường dẫn thư mục hiện tại (routes)
CURRENT_ROUTES_DIR = os.path.dirname(os.path.abspath(__file__))

# Thêm vào sys.path để ưu tiên tìm file ở đây
if CURRENT_ROUTES_DIR not in sys.path:
    sys.path.insert(0, CURRENT_ROUTES_DIR)

try:
    import cost_estimation
    print(f"✅ [System] Đã kết nối module đồng đội: cost_estimation")
except ImportError as e:
    print(f"❌ [CRITICAL ERROR] Không thể import 'cost_estimation': {e}")
    cost_estimation = None

# ==============================================================================
# 3. CẤU HÌNH ĐƯỜNG DẪN DB (FIXED CHO CẤU TRÚC ẢNH CŨ)
# ==============================================================================

# Logic: .../backend/routes/pricing_score.py -> Lùi 2 cấp -> data/vehicle.db
BACKEND_DIR = os.path.dirname(CURRENT_ROUTES_DIR)   # Lùi 1 cấp
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)         # Lùi 2 cấp
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')       # Vào thư mục data
VEHICLE_DB_PATH = os.path.join(DATA_DIR, 'vehicle.db')

# Kiểm tra
if os.path.exists(VEHICLE_DB_PATH):
    print(f"✅ [System] Đã tìm thấy DB tại: {VEHICLE_DB_PATH}")
else:
    print(f"❌ [Lỗi] Không tìm thấy DB tại: {VEHICLE_DB_PATH}")
    # Fallback: Thử tìm ngay cạnh file này (nếu bạn đã copy db vào đây)
    VEHICLE_DB_PATH = os.path.join(CURRENT_ROUTES_DIR, 'vehicle.db')

# ==============================================================================
# 4. CLASS DỮ LIỆU
# ==============================================================================

class UserRequest:
    def __init__(self, is_student, priorities):
        self.is_student = is_student
        self.priorities = priorities

class WeatherContext:
    def __init__(self, is_raining, is_hot, description):
        self.is_raining = is_raining
        self.is_hot = is_hot
        self.description = description

# ==============================================================================
# 5. MODULE DB (LẤY DỮ LIỆU & MAPPING)
# ==============================================================================

def get_modes_with_mapping():
    """Đọc DB và map ID sang từ khóa cho cost_estimation"""
    modes = []
    try:
        if not os.path.exists(VEHICLE_DB_PATH): return []

        conn = sqlite3.connect(VEHICLE_DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Query lấy thông tin cơ bản + hiệu suất
        query = """
        SELECT 
            v.type_key as id, 
            v.display_name_vi as name, 
            v.has_roof,
            perf.avg_speed_kmh
        FROM vehicle_types v
        LEFT JOIN performance_profiles perf ON v.type_id = perf.type_id
        """
        cursor.execute(query)
        
        for row in cursor.fetchall():
            mode = dict(row)
            
            # --- MAPPING LOGIC QUAN TRỌNG ---
            # Phải khớp với logic trong cost_estimation.py
            if mode['id'] == 'walking':
                mode['mapping_key'] = 'walking'
            elif 'bus' in mode['id']:
                mode['mapping_key'] = 'bus'
            elif 'bike' in mode['id']: 
                mode['mapping_key'] = 'ride_hailing_bike'
            elif 'car' in mode['id'] or 'taxi' in mode['id']:
                mode['mapping_key'] = 'ride_hailing_car'
            else:
                mode['mapping_key'] = None 
            
            modes.append(mode)
        conn.close()
    except Exception as e:
        print(f"❌ Lỗi đọc DB: {e}")
        return []
    
    return modes

# ==============================================================================
# 6. API THỜI TIẾT & HELPERS
# ==============================================================================

def fetch_weather_context(lat, lon, api_key):
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
        return WeatherContext(False, False, "Lỗi kết nối")

def calculate_weights(priorities):
    weights = {'cost': 0.25, 'time': 0.25, 'safety': 0.25, 'weather': 0.25}
    BOOST = 0.3
    if 'saving' in priorities: weights['cost'] += BOOST
    if 'speed' in priorities: weights['time'] += BOOST
    if 'safety' in priorities: weights['safety'] += BOOST
    if 'comfort' in priorities: weights['weather'] += BOOST
    
    total = sum(weights.values())
    return {k: v/total for k, v in weights.items()}

# ==============================================================================
# 7. THUẬT TOÁN GỢI Ý (CORE)
# ==============================================================================

def calculate_adaptive_scores(user, trip_distance, weather_ctx, traffic_level=0.5):
    
    # 1. Lấy dữ liệu từ DB
    modes = get_modes_with_mapping()
    if not modes: 
        print("⚠️ Không lấy được dữ liệu xe từ DB.")
        return []

    weights = calculate_weights(user.priorities)
    
    # Ngưỡng tâm lý (0-10)
    ref_cost = 50000.0 if user.is_student else 100000.0
    ref_time = 45.0
    
    results = []
    
    for mode in modes:
        if not mode.get('mapping_key'): continue 

        # --- A. TÍNH GIÁ (GỌI HÀM ĐỒNG ĐỘI) ---
        try:
            if cost_estimation:
                # Gọi hàm từ module đồng đội
                final_price = cost_estimation.calculate_transport_cost(
                    mode=mode['mapping_key'],
                    distance_km=trip_distance,
                    is_student=user.is_student,
                    is_raining=weather_ctx.is_raining
                )
            else:
                final_price = 0
        except Exception as e:
            print(f"⚠️ Lỗi cost_estimation ({mode['name']}): {e}")
            final_price = 0 

        # --- B. TÍNH THỜI GIAN (TỰ TÍNH) ---
        avg_speed = mode.get('avg_speed_kmh') or 30.0
        impact = traffic_level
        if 'bike' in mode['id']: impact *= 0.6 
        
        real_speed = avg_speed * (1.0 - (impact * 0.5))
        if real_speed <= 0: real_speed = 1.0
        duration_min = (trip_distance / real_speed) * 60

        # --- C. TÍNH ĐIỂM (LOGIC CỦA BẠN) ---
        s_cost = 10 * (ref_cost / (ref_cost + final_price)) if final_price > 0 else 10
        s_time = 10 * (ref_time / (ref_time + duration_min))
        
        s_weather = 10
        if weather_ctx.is_raining and not mode['has_roof']: s_weather = 1.0
        elif weather_ctx.is_hot and 'bike' in mode['id']: s_weather = 6.0
            
        s_safety = 10
        if 'bike' in mode['id'] and traffic_level > 0.7: s_safety = 7.0

        final_score = (
            (s_cost * weights['cost']) + 
            (s_time * weights['time']) + 
            (s_safety * weights['safety']) + 
            (s_weather * weights['weather'])
        )
        
        # --- D. NHÃN ---
        labels = []
        if s_cost > 8.5: labels.append("💰 Siêu Rẻ")
        if s_weather > 8.5 and mode['has_roof']: labels.append("❄️ Mát mẻ")
        
        results.append({
            "mode_name": mode['name'], 
            "price": int(final_price),
            "duration": int(duration_min),
            "score": round(final_score, 2),
            "labels": labels,
            "note": f"Map: {mode['mapping_key']}"
        })
        
    return sorted(results, key=lambda x: x['score'], reverse=True)