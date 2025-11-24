import sqlite3
import os
import sys
import io

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

# --- 2. KHỞI TẠO BIẾN TOÀN CỤC ---
PRICE_CONFIG = get_price_config()

# --- 3. HÀM TÍNH TOÁN ---
def calculate_transport_cost(mode, distance_km, is_student=False, is_raining=False):
    current_config = PRICE_CONFIG or {}

    # --- 1. Đi bộ ---
    if mode == "walking":
        return {"value": 0, "display": "Miễn phí"}
        
    # --- 2. Xe buýt ---
    if mode == "bus":
        bus_cfg = current_config.get("bus", {})
        num_trips = 2 if distance_km > 15 else 1
        price = bus_cfg.get("ticket_student", 3000) if is_student else bus_cfg.get("ticket_normal", 6000)
        total = price * num_trips
        
        # Format chuẩn: 6,000VND
        return {
            "value": total,
            "display": f"{total:,}VND" 
        }

    # --- 3. Xe công nghệ ---
    elif mode in ["ride_hailing_bike", "ride_hailing_car"]:
        providers = current_config.get(mode)
        
        if not providers: 
            return {"value": 0, "display": "N/A"}
        
        list_of_prices = [] 

        for cfg in providers:
            total_provider = 0
            
            # Logic Xe Máy
            if mode == "ride_hailing_bike":
                if distance_km <= cfg["base_distance"]:
                    total_provider = cfg["base_fare"]
                else:
                    extra_km = distance_km - cfg["base_distance"]
                    total_provider = cfg["base_fare"] + (extra_km * cfg["price_per_km"])

            # Logic Xe Hơi
            elif mode == "ride_hailing_car":
                if distance_km <= cfg["base_distance"]:
                    total_provider = cfg["base_fare"]
                else:
                    total_provider = cfg["base_fare"]
                    remain_km = distance_km - cfg["base_distance"]
                    
                    km_tier_1 = min(remain_km, 10)
                    total_provider += km_tier_1 * cfg["per_km_3_12"]
                    remain_km -= km_tier_1

                    if remain_km > 0:
                        km_tier_2 = min(remain_km, 13)
                        total_provider += km_tier_2 * cfg["per_km_13_25"]
                        remain_km -= km_tier_2
                    
                    if remain_km > 0:
                        total_provider += remain_km * cfg["per_km_26_plus"]
            
            # Mưa
            if is_raining:
                total_provider *= cfg.get("weather_surge", 1.0)
            
            list_of_prices.append(total_provider)

        # TÍNH TRUNG BÌNH
        if not list_of_prices:
             return {"value": 0, "display": "N/A"}

        avg_raw = sum(list_of_prices) / len(list_of_prices)
        avg_rounded = int(round(avg_raw, -3)) # Làm tròn đến hàng nghìn
        
        # --- FORMAT HIỂN THỊ CHUYÊN NGHIỆP ---
        # f"{avg_rounded:,}" -> Tự động thêm dấu phẩy: 45,000
        display_str = f"~{avg_rounded:,}VND"

        return {
            "value": avg_rounded, 
            "display": display_str
        }

    return {"value": 0, "display": "0VND"}
