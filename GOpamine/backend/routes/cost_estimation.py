import sqlite3
import os
import sys
import io
from datetime import datetime

# Sửa lỗi hiển thị emoji trên Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# --- 1. CẤU HÌNH DATABASE ---
DB_PATH = os.path.join(os.path.dirname(__file__), '../data/vehicle.db')

def get_db_connection():
    """Tạo kết nối đến SQLite DB"""
    if not os.path.exists(DB_PATH):
        print(f"❌ Không tìm thấy file DB tại: {DB_PATH}")
        return None
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row 
    return conn

def get_price_config():
    """Load giá từ DB. Trả về LIST các cấu hình để tính trung bình."""
    config = {
        "walking": {"price": 0},
        "bus": {"ticket_normal": 6000, "ticket_student": 3000},
        "ride_hailing_bike": [], 
        "ride_hailing_car": []   
    }

    try:
        conn = get_db_connection()
        if not conn: return config 
        cursor = conn.cursor()

        # Load Xe Máy
        bike_rows = cursor.execute("SELECT * FROM motorbike_pricing").fetchall()
        for row in bike_rows:
            config["ride_hailing_bike"].append({
                "brand": row["brand"] if "brand" in row.keys() else "Unknown",
                "base_fare": row["base_price"] or 0,
                "base_distance": row["base_distance_km"] or 0,
                "price_per_km": row["per_km_after_base"] or 0,
                "weather_surge": 1.3 
            })

        # Load Xe Hơi
        car_rows = cursor.execute("SELECT * FROM car_pricing").fetchall()
        for row in car_rows:
            config["ride_hailing_car"].append({
                "brand": row["brand"] if "brand" in row.keys() else "Unknown",
                "base_fare": row["base_price"] or 0,
                "base_distance": row["base_distance_km"] or 0,
                "per_km_3_12": row["per_km_3_12"] or 0,
                "per_km_13_25": row["per_km_13_25"] or 0,
                "per_km_26_plus": row["per_km_26_plus"] or 0,
                "weather_surge": 1.5
            })
        conn.close()
        return config
    except Exception as e:
        print(f"❌ Lỗi khi đọc Database: {e}")
        return config 

# Khởi tạo biến toàn cục
PRICE_CONFIG = get_price_config()

# --- 2. HÀM TÍNH HỆ SỐ KẸT XE ---
def get_traffic_surge_factor(hour):
    """Trả về hệ số tăng giá dựa trên khung giờ."""
    # Sáng: 7h - 9h (Tăng 20%)
    if 7 <= hour < 9: return 1.2 
    # Chiều: 17h - 19h (Tăng 30%)
    if 17 <= hour < 19: return 1.3 
    return 1.0

# --- 3. HÀM TÍNH TOÁN CHÍNH ---
def calculate_transport_cost(mode, distance_km, is_student=False, is_raining=False, departure_hour=None):
    current_config = PRICE_CONFIG or {}

    # Logic thời gian
    if departure_hour is None:
        departure_hour = datetime.now().hour
    traffic_factor = get_traffic_surge_factor(departure_hour)

    # 1. Đi bộ
    if mode == "walking":
        return {"value": 0, "display": "Miễn phí"}
        
    # 2. Xe buýt
    if mode == "bus":
        bus_cfg = current_config.get("bus", {})
        num_trips = 2 if distance_km > 15 else 1
        price = bus_cfg.get("ticket_student", 3000) if is_student else bus_cfg.get("ticket_normal", 6000)
        total = price * num_trips
        return {"value": total, "display": f"{total:,}VND"}

    # 3. Xe công nghệ (Tính trung bình tất cả hãng)
    elif mode in ["ride_hailing_bike", "ride_hailing_car"]:
        providers = current_config.get(mode)
        if not providers: return {"value": 0, "display": "N/A"}
        
        list_of_prices = [] 

        for cfg in providers:
            total_provider = 0
            
            # --- TÍNH GIÁ GỐC ---
            if mode == "ride_hailing_bike":
                if distance_km <= cfg["base_distance"]:
                    total_provider = cfg["base_fare"]
                else:
                    extra = distance_km - cfg["base_distance"]
                    total_provider = cfg["base_fare"] + (extra * cfg["price_per_km"])

            elif mode == "ride_hailing_car":
                if distance_km <= cfg["base_distance"]:
                    total_provider = cfg["base_fare"]
                else:
                    total_provider = cfg["base_fare"]
                    remain = distance_km - cfg["base_distance"]
                    # Nấc 1
                    t1 = min(remain, 10)
                    total_provider += t1 * cfg["per_km_3_12"]
                    remain -= t1
                    # Nấc 2
                    if remain > 0:
                        t2 = min(remain, 13)
                        total_provider += t2 * cfg["per_km_13_25"]
                        remain -= t2
                    # Nấc 3
                    if remain > 0:
                        total_provider += remain * cfg["per_km_26_plus"]
            
            # --- ÁP DỤNG HỆ SỐ ---
            if is_raining:
                total_provider *= cfg.get("weather_surge", 1.0)
            
            total_provider *= traffic_factor # Kẹt xe
            
            list_of_prices.append(total_provider)

        # --- TÍNH TRUNG BÌNH ---
        if not list_of_prices: return {"value": 0, "display": "N/A"}

        avg_raw = sum(list_of_prices) / len(list_of_prices)
        avg_rounded = int(round(avg_raw, -3)) # Làm tròn 1000
        
        return {
            "value": avg_rounded, 
            "display": f"~{avg_rounded:,}VND"
        }

    return {"value": 0, "display": "0VND"}
