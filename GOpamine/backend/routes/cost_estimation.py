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

    # 1. Helper: Làm đẹp tên hãng
    def prettify_brand(name):
        if not name: return "Standard"
        name_lower = name.lower().strip()
        if "xanh" in name_lower and "sm" in name_lower: return "Xanh SM"
        if name_lower in ["be", "bebike", "becar"]: return "Be"
        if name_lower == "grab": return "Grab"
        return name.title()

    # 2. Helper: Tạo tên hiển thị chuẩn (QUAN TRỌNG)
    # Format: [Hãng] [Bike/Car] [Premium?] [(Số chỗ?)]
    def create_display_name(mode_type, raw_brand, tier, seats=None):
        pretty_brand = prettify_brand(raw_brand)
        
        # Xử lý Tier: Nếu là Normal thì ẩn đi, nếu là Premium/Plus thì hiện ra
        tier_display = "" if tier.lower() == "normal" else f" {tier}"
        
        if mode_type == "bike":
            return f"{pretty_brand} Bike{tier_display}"
        else: # car
            return f"{pretty_brand} Car{tier_display} ({seats} chỗ)"

    # A. Load Xe Máy (Tách riêng Normal/Premium)
    try:
        rows = cursor.execute("SELECT * FROM motorbike_pricing").fetchall()
        for row in rows:
            brand = row["brand"] or "Standard"
            tier = row["type"] or "Normal"
            
            # Key unique: brand + tier (để Grab Bike Normal và Premium không đè nhau)
            key = f"{brand}_{tier}".lower().replace(" ", "")
            
            config["motorbike"][key] = {
                "brand": brand,
                "tier": tier,
                # Gọi hàm tạo tên cho Bike
                "display_name": create_display_name("bike", brand, tier),
                "base_fare": row["base_price"],
                "base_distance": row["base_distance_km"],
                "price_per_km": row["per_km_after_base"],
                "weather_surge": 1.2
            }
    except Exception: pass

    # B. Load Ô tô (Tách riêng Normal/Premium + Thêm chữ Car)
    try:
        rows = cursor.execute("SELECT * FROM car_pricing").fetchall()
        for row in rows:
            brand = row["brand"] or "Standard"
            tier = row["type"] or "Normal"
            # Lấy số ghế thực tế
            seats = int(row["number_of_seats"]) if "number_of_seats" in row.keys() and row["number_of_seats"] else 4
            
            # Key unique: brand + tier + seats
            key = f"{brand}_{tier}_{seats}cho".lower().replace(" ", "")
            
            config["car"][key] = {
                "brand": brand,
                "tier": tier,
                "seats": seats,
                # Gọi hàm tạo tên cho Car
                "display_name": create_display_name("car", brand, tier, seats),
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
# ==============================================================================
# 4. CORE: TÍNH TIỀN (GOM NHÓM MIN ~ MAX)
# ==============================================================================
def calculate_transport_cost(mode, distance_km, is_student=False, is_raining=False, brand_name=None):
    
    # 1. Nhóm giá cố định
    if mode == "walking": return {"value": 0, "display": "Miễn phí"}
    if mode == "bus":
        price = 3000 if is_student else 7000
        total = price * 2 if distance_km > 15 else price
        return {"value": total, "display": f"{total:,}đ"}

    # 2. Nhóm Xe công nghệ
    # Xác định đang tìm Bike hay Car
    vehicle_group = "motorbike" if "bike" in mode or "motor" in mode else "car"
    all_services = PRICE_CONFIG.get(vehicle_group, {})
    
    if not brand_name: return {"value": 0, "display": "N/A"}

    # Xác định yêu cầu về ghế (Nếu là Car)
    required_seats = 0
    if vehicle_group == "car":
        if "7" in mode: required_seats = 7
        else: required_seats = 4 # Mặc định coi như tìm 4 chỗ nếu không nói gì
    
    prices = []

    # --- QUÉT CONFIG ĐỂ TÌM TẤT CẢ CÁC TIER (Normal, Premium...) ---
    for key, cfg in all_services.items():
        # 1. Lọc đúng Hãng
        if cfg['brand'].lower() != brand_name.lower(): continue

        # 2. Nếu là Car, Lọc đúng Số Ghế
        if vehicle_group == "car":
            # Logic: Tìm xe 4 chỗ -> Lấy xe 4, 5 chỗ. Tìm 7 chỗ -> Lấy xe 7 chỗ.
            seats = cfg.get('seats', 4)
            if required_seats == 7:
                if seats < 7: continue # Bỏ qua xe nhỏ
            else: # Tìm 4 chỗ
                if seats >= 7: continue # Bỏ qua xe to

            # Tính giá Car
            val = calculate_single_car_price(cfg, distance_km, is_raining)
            prices.append(val)

        else: 
            # Tính giá Bike
            total = 0
            if distance_km <= cfg["base_distance"]: total = cfg["base_fare"]
            else: total = cfg["base_fare"] + ((distance_km - cfg["base_distance"]) * cfg["price_per_km"])
            if is_raining: total *= cfg.get("weather_surge", 1.0)
            prices.append(total)

    # --- KẾT QUẢ ---
    if not prices: return {"value": 0, "display": "Chưa có giá"}

    # Tính toán Min ~ Max
    avg_raw = sum(prices) / len(prices)
    final_price = int(round(avg_raw, -3)) # Giá trị dùng để sort/chấm điểm
    
    min_p = int(round(min(prices), -3))
    max_p = int(round(max(prices), -3))

    if min_p == max_p:
        display_str = f"{final_price:,}đ"
    else:
        # Hiển thị dạng khoảng giá: 25,000~35,000đ
        display_str = f"{min_p:,}~{max_p:,}đ"

    return {"value": final_price, "display": display_str}