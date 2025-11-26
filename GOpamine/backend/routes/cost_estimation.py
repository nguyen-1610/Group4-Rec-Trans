import sqlite3
import os
import sys

# ==============================================================================
# 1. CẤU HÌNH KẾT NỐI DATABASE
# ==============================================================================
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, '../../'))
DB_PATH = os.path.join(PROJECT_ROOT, 'data', 'vehicle.db')

def get_db_connection():
    if not os.path.exists(DB_PATH): return None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row 
        return conn
    except Exception as e:
        print(f"❌ [Database Error] {e}")
        return None

# ==============================================================================
# 2. LOAD DỮ LIỆU GIÁ TỪ DB (CÓ ĐỌC SỐ GHẾ)
# ==============================================================================
def load_price_config_from_db():
    config = { "walking": 0, "bus": 7000, "motorbike": {}, "car": {} }
    conn = get_db_connection()
    if not conn: return config
    cursor = conn.cursor()

    # Helper: Làm đẹp tên hãng
    def prettify_brand(name):
        if not name: return "Standard"
        name_lower = name.lower().strip()
        if "xanh" in name_lower and "sm" in name_lower: return "Xanh SM"
        if name_lower in ["be", "bebike", "becar"]: return "Be"
        if name_lower == "grab": return "Grab"
        return name.title()

    # Helper: Ghép tên hiển thị
    def format_display_name(raw_brand, seats, suffix):
        pretty_brand = prettify_brand(raw_brand)
        # Hiển thị rõ số chỗ: "Grab Car (4 chỗ)"
        return f"{pretty_brand} {suffix} ({seats} chỗ)"

    # A. Load Xe Máy
    try:
        rows = cursor.execute("SELECT * FROM motorbike_pricing").fetchall()
        for row in rows:
            brand = row["brand"] or "Standard"
            tier = row["type"] or "Normal"
            key = f"{brand}_{tier}".lower().replace(" ", "")
            
            config["motorbike"][key] = {
                "brand": brand,
                "tier": tier,
                "display_name": f"{prettify_brand(brand)} Bike", 
                "base_fare": row["base_price"],
                "base_distance": row["base_distance_km"],
                "price_per_km": row["per_km_after_base"],
                "weather_surge": 1.2
            }
    except Exception: pass

    # B. Load Ô tô (SỬ DỤNG CỘT NUMBER_OF_SEATS)
    try:
        rows = cursor.execute("SELECT * FROM car_pricing").fetchall()
        for row in rows:
            brand = row["brand"] or "Standard"
            tier = row["type"] or "Normal"
            # [FIX] Lấy số ghế từ cột DB
            seats = row["number_of_seats"] if "number_of_seats" in row.keys() else 4
            
            # Tạo key unique để lưu config
            key = f"{brand}_{seats}cho".lower().replace(" ", "")
            
            config["car"][key] = {
                "brand": brand,
                "tier": tier,
                "seats": seats, # Lưu số ghế vào config để logic tính toán dùng
                "display_name": format_display_name(brand, seats, "Car"),
                "base_fare": row["base_price"],
                "base_distance": row["base_distance_km"],
                "per_km_3_12": row["per_km_3_12"],
                "per_km_13_25": row["per_km_13_25"],
                "per_km_26_plus": row["per_km_26_plus"],
                "weather_surge": 1.4
            }
    except Exception as e:
        print(f"Lỗi load Car: {e}")

    conn.close()
    return config

PRICE_CONFIG = load_price_config_from_db()

# ==============================================================================
# 3. HELPER TÍNH GIÁ CHI TIẾT
# ==============================================================================
def calculate_single_car_price(cfg, distance_km, is_raining):
    total = 0
    if distance_km <= cfg["base_distance"]: 
        total = cfg["base_fare"]
    else:
        remain = distance_km - cfg["base_distance"]
        total = cfg["base_fare"]
        
        km_1 = min(remain, 10) # 3-12km (khoảng 10km)
        # Fix lỗi nếu DB để null thì lấy mặc định
        price_1 = cfg["per_km_3_12"] if cfg["per_km_3_12"] else 10000
        total += km_1 * price_1
        remain -= km_1
        
        if remain > 0:
            km_2 = min(remain, 13) # 13-25km
            price_2 = cfg["per_km_13_25"] if cfg["per_km_13_25"] else 12000
            total += km_2 * price_2
            remain -= km_2
            
        if remain > 0:
            price_3 = cfg["per_km_26_plus"] if cfg["per_km_26_plus"] else 11000
            total += remain * price_3

    if is_raining: total *= cfg.get("weather_surge", 1.0)
    return total

# ==============================================================================
# 4. CORE: TÍNH TIỀN (LỌC THEO SỐ GHẾ & LÀM TRÒN)
# ==============================================================================
def calculate_transport_cost(mode, distance_km, is_student=False, is_raining=False, brand_name=None):
    
    # 1. Nhóm giá cố định
    if mode == "walking": return {"value": 0, "display": "Miễn phí"}
    if mode == "bus":
        price = 3000 if is_student else 7000
        total = price * 2 if distance_km > 15 else price
        return {"value": total, "display": f"{total:,}đ"}

    # 2. Nhóm Xe công nghệ
    vehicle_group = "motorbike" if "bike" in mode or "motor" in mode else "car"
    all_services = PRICE_CONFIG.get(vehicle_group, {})
    
    if not brand_name: return {"value": 0, "display": "N/A"}

    # [FIX] Xác định loại xe yêu cầu dựa trên string mode
    required_seats = None
    if vehicle_group == "car":
        if "car_7" in mode or "7 chỗ" in mode: required_seats = 7
        elif "car_4" in mode or "4 chỗ" in mode: required_seats = 4
    
    prices = []
    backup_4_seats = [] # Dùng để fallback

    for key, cfg in all_services.items():
        # Lọc Hãng
        if cfg['brand'].lower() != brand_name.lower(): continue

        if vehicle_group == "car":
            # [FIX] Lọc theo cột 'seats' trong config (đã lấy từ DB)
            current_seats = cfg.get('seats', 4)
            
            # Logic lọc:
            # - Nếu cần 7 chỗ -> Chỉ lấy xe >= 7 chỗ
            # - Nếu cần 4 chỗ -> Lấy xe 4 hoặc 5 chỗ
            is_match = False
            if required_seats == 7:
                if current_seats >= 7: is_match = True
            elif required_seats == 4:
                if current_seats < 7: is_match = True
            else:
                is_match = True # Không yêu cầu cụ thể

            # Tính giá
            price_val = calculate_single_car_price(cfg, distance_km, is_raining)
            
            if is_match:
                prices.append(price_val)
            
            # Lưu backup
            if current_seats < 7:
                backup_4_seats.append(price_val)

        else: # Xe máy
            # Logic cũ cho xe máy
            total = 0
            if distance_km <= cfg["base_distance"]: total = cfg["base_fare"]
            else: total = cfg["base_fare"] + ((distance_km - cfg["base_distance"]) * cfg["price_per_km"])
            if is_raining: total *= cfg.get("weather_surge", 1.0)
            prices.append(total)

    # --- FALLBACK ---
    if not prices and required_seats == 7 and backup_4_seats:
        # Nếu không tìm thấy xe 7 chỗ, lấy giá xe 4 chỗ * 1.3
        prices = [p * 1.3 for p in backup_4_seats]

    if not prices: return {"value": 0, "display": "Chưa có giá"}

    # --- LÀM TRÒN (ROUNDING) ---
    avg_raw = sum(prices) / len(prices)
    
    # [FIX] Làm tròn đến hàng nghìn (-3)
    final_price = int(round(avg_raw, -3))
    
    min_p = int(round(min(prices), -3))
    max_p = int(round(max(prices), -3))

    if min_p == max_p:
        display_str = f"{final_price:,}đ"
    else:
        display_str = f"{min_p:,}~{max_p:,}đ"

    return {"value": final_price, "display": display_str}