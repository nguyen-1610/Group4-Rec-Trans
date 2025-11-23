import sys
import os

# Thêm đường dẫn để import được file database.py từ thư mục utils
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.database import get_price_config

# Lấy giá 1 lần khi khởi động
PRICE_CONFIG = get_price_config()

# GIÁ DỰ PHÒNG (Backup): Nếu chưa có database thì dùng cái này
if not PRICE_CONFIG:
    print("⚠️ Chưa có Database, đang dùng giá mặc định.")
    PRICE_CONFIG = {
        "walking": {"price": 0},
        "bus": {"ticket_normal": 6000, "ticket_student": 3000},
        "ride_hailing_bike": {"base_fare": 12500, "base_distance": 2, "price_per_km": 4300, "weather_surge": 1.3},
        "ride_hailing_car": {"base_fare": 27000, "base_distance": 2, "price_per_km": 9500, "weather_surge": 1.5}
    }

def calculate_transport_cost(mode, distance_km, is_student=False, is_raining=False):
    """
    Hàm tính tiền.
    Input:
        - mode: 'walking', 'bus', 'ride_hailing_bike', 'ride_hailing_car'
        - distance_km: Số km (float)
        - is_student: True/False
        - is_raining: True/False
    """
    # 1. Đi bộ
    if mode == "walking":
        return 0
        
    # 2. Xe buýt
    elif mode == "bus":
        # Đi > 15km tính 2 chuyến
        num_trips = 2 if distance_km > 15 else 1
        ticket = PRICE_CONFIG["bus"]["ticket_student"] if is_student else PRICE_CONFIG["bus"]["ticket_normal"]
        return ticket * num_trips

    # 3. Xe công nghệ
    elif mode in ["ride_hailing_bike", "ride_hailing_car"]:
        cfg = PRICE_CONFIG.get(mode)
        if not cfg: return 0
        
        # Tính giá theo km
        if distance_km <= cfg["base_distance"]:
            total = cfg["base_fare"]
        else:
            extra = distance_km - cfg["base_distance"]
            total = cfg["base_fare"] + (extra * cfg["price_per_km"])
            
        # Tính mưa (Surge Pricing)
        if is_raining:
            total *= cfg["weather_surge"]
            
        return int(total)

    return 0