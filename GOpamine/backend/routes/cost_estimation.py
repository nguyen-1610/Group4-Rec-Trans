import sqlite3
import os
import sys

# ==============================================================================
# 1. CẤU HÌNH KẾT NỐI DATABASE
# ==============================================================================
# Lấy đường dẫn thư mục hiện tại của file này (backend/routes)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
# Lấy đường dẫn thư mục gốc dự án (nhảy ra ngoài 2 cấp: backend/routes -> backend -> GOpamine)
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, '../../'))
# Đường dẫn tuyệt đối đến file database vehicle.db
DB_PATH = os.path.join(PROJECT_ROOT, 'data', 'vehicle.db')

def get_db_connection():
    # Kiểm tra xem file db có tồn tại không
    if not os.path.exists(DB_PATH): return None
    try:
        # Kết nối SQLite
        conn = sqlite3.connect(DB_PATH)
        # Cấu hình để kết quả trả về dạng từ điển (dict) thay vì tuple, giúp truy cập bằng tên cột (row['price'])
        conn.row_factory = sqlite3.Row 
        return conn
    except Exception as e:
        print(f"❌ [Database Error] {e}")
        return None

# ==============================================================================
# 2. LOAD DỮ LIỆU GIÁ TỪ DB (CÓ ĐỌC SỐ GHẾ)
# ==============================================================================
def load_price_config_from_db():
    # Cấu hình mặc định: Đi bộ 0đ, Bus mặc định 7000đ
    config = { "walking": 0, "bus": 7000, "motorbike": {}, "car": {} }
    conn = get_db_connection()
    if not conn: return config # Nếu lỗi DB thì trả về mặc định
    cursor = conn.cursor()

    # Helper: Hàm làm đẹp tên hãng (Ví dụ: "grab" -> "Grab", "bebike" -> "Be")
    def prettify_brand(name):
        if not name: return "Standard"
        name_lower = name.lower().strip()
        if "xanh" in name_lower and "sm" in name_lower: return "Xanh SM"
        if name_lower in ["be", "bebike", "becar"]: return "Be"
        if name_lower == "grab": return "Grab"
        return name.title() # Viết hoa chữ cái đầu

    # Helper: Hàm tạo tên hiển thị đầy đủ (Ví dụ: "Grab Car (4 chỗ)")
    def format_display_name(raw_brand, seats, suffix):
        pretty_brand = prettify_brand(raw_brand)
        return f"{pretty_brand} {suffix} ({seats} chỗ)"

    # A. Load giá Xe Máy từ bảng 'motorbike_pricing'
    try:
        rows = cursor.execute("SELECT * FROM motorbike_pricing").fetchall()
        for row in rows:
            brand = row["brand"] or "Standard"
            tier = row["type"] or "Normal"
            # Tạo key định danh (VD: "grab_normal")
            key = f"{brand}_{tier}".lower().replace(" ", "")
            
            # Lưu cấu hình giá vào dictionary
            config["motorbike"][key] = {
                "brand": brand,
                "tier": tier,
                "display_name": f"{prettify_brand(brand)} Bike", 
                "base_fare": row["base_price"],       # Giá mở cửa (VD: 15k cho 2km đầu)
                "base_distance": row["base_distance_km"], # Khoảng cách mở cửa (VD: 2km)
                "price_per_km": row["per_km_after_base"], # Giá mỗi km tiếp theo (VD: 5k/km)
                "weather_surge": 1.2 # Hệ số tăng giá khi mưa (mặc định tăng 20%)
            }
    except Exception: pass

    # B. Load giá Ô tô từ bảng 'car_pricing'
    try:
        rows = cursor.execute("SELECT * FROM car_pricing").fetchall()
        for row in rows:
            brand = row["brand"] or "Standard"
            tier = row["type"] or "Normal"
            # Lấy số ghế, mặc định là 4 nếu không có
            seats = row["number_of_seats"] if "number_of_seats" in row.keys() else 4
            
            # Tạo key unique (VD: "grab_4cho")
            key = f"{brand}_{seats}cho".lower().replace(" ", "")
            
            config["car"][key] = {
                "brand": brand,
                "tier": tier,
                "seats": seats, 
                "display_name": format_display_name(brand, seats, "Car"),
                "base_fare": row["base_price"], # Giá mở cửa
                "base_distance": row["base_distance_km"], # Km mở cửa
                # Giá theo bậc thang (tier pricing)
                "per_km_3_12": row["per_km_3_12"],   # Giá km thứ 3 đến 12
                "per_km_13_25": row["per_km_13_25"], # Giá km thứ 13 đến 25
                "per_km_26_plus": row["per_km_26_plus"], # Giá km thứ 26 trở đi
                "weather_surge": 1.4 # Mưa tăng giá 40%
            }
    except Exception as e:
        print(f"Lỗi load Car: {e}")

    conn.close()
    return config

# Biến toàn cục chứa cấu hình giá (Load 1 lần khi chạy server)
PRICE_CONFIG = load_price_config_from_db()

# ==============================================================================
# 3. HELPER TÍNH GIÁ CHI TIẾT (Logic tính tiền theo bậc thang)
# ==============================================================================
def calculate_single_car_price(cfg, distance_km, is_raining):
    total = 0
    # Trường hợp 1: Đi ngắn hơn khoảng cách mở cửa (VD: đi 1km, giá mở cửa cho 2km)
    if distance_km <= cfg["base_distance"]: 
        total = cfg["base_fare"]
    else:
        # Trường hợp 2: Đi xa hơn.
        # Bước 1: Tính giá mở cửa
        remain = distance_km - cfg["base_distance"]
        total = cfg["base_fare"]
        
        # Bước 2: Tính giá cho đoạn từ km thứ 3 đến 12 (tối đa 10km)
        km_1 = min(remain, 10) 
        price_1 = cfg["per_km_3_12"] if cfg["per_km_3_12"] else 10000
        total += km_1 * price_1
        remain -= km_1 # Trừ đi quãng đường đã tính
        
        # Bước 3: Tính giá cho đoạn từ km thứ 13 đến 25 (tối đa 13km)
        if remain > 0:
            km_2 = min(remain, 13) 
            price_2 = cfg["per_km_13_25"] if cfg["per_km_13_25"] else 12000
            total += km_2 * price_2
            remain -= km_2
            
        # Bước 4: Tính giá cho đoạn đường còn lại (> 25km)
        if remain > 0:
            price_3 = cfg["per_km_26_plus"] if cfg["per_km_26_plus"] else 11000
            total += remain * price_3

    # Nếu trời mưa, nhân hệ số tăng giá
    if is_raining: total *= cfg.get("weather_surge", 1.0)
    return total

# ==============================================================================
# 4. CORE: TÍNH TIỀN CHÍNH (Được gọi từ bên ngoài)
# ==============================================================================
def calculate_transport_cost(mode, distance_km, is_student=False, is_raining=False, brand_name=None):
    
    # 1. Xử lý các loại phương tiện đặc biệt (Đi bộ, Bus)
    if mode == "walking": return {"value": 0, "display": "Miễn phí"}
    if mode == "bus":
        price = 3000 if is_student else 7000 # Vé xe buýt
        # Nếu đi xa > 15km, giả định phải bắt 2 chuyến bus -> nhân đôi tiền
        total = price * 2 if distance_km > 15 else price
        return {"value": total, "display": f"{total:,}đ"}

    # 2. Xử lý Xe công nghệ (Bike/Car)
    # Xác định nhóm xe dựa trên input 'mode'
    vehicle_group = "motorbike" if "bike" in mode or "motor" in mode else "car"
    all_services = PRICE_CONFIG.get(vehicle_group, {})
    
    if not brand_name: return {"value": 0, "display": "N/A"}

    # Xác định số chỗ ngồi yêu cầu (nếu là ô tô)
    required_seats = None
    if vehicle_group == "car":
        if "car_7" in mode or "7 chỗ" in mode: required_seats = 7
        elif "car_4" in mode or "4 chỗ" in mode: required_seats = 4
    
    prices = [] # Danh sách các mức giá tìm được
    backup_4_seats = [] # Giá xe 4 chỗ để dự phòng (nếu tìm xe 7 chỗ không ra)

    # Duyệt qua các cấu hình giá đã load từ DB
    for key, cfg in all_services.items():
        # Chỉ tính hãng được yêu cầu (VD: chỉ tính Grab)
        if cfg['brand'].lower() != brand_name.lower(): continue

        if vehicle_group == "car":
            current_seats = cfg.get('seats', 4)
            
            # Logic lọc xe theo số chỗ:
            is_match = False
            if required_seats == 7:
                if current_seats >= 7: is_match = True # Cần 7 chỗ, xe >= 7 chỗ OK
            elif required_seats == 4:
                if current_seats < 7: is_match = True  # Cần 4 chỗ, xe < 7 chỗ OK
            else:
                is_match = True # Không yêu cầu cụ thể

            # Gọi hàm tính giá chi tiết ở trên
            price_val = calculate_single_car_price(cfg, distance_km, is_raining)
            
            if is_match:
                prices.append(price_val)
            
            # Lưu lại giá xe 4 chỗ để làm phương án dự phòng
            if current_seats < 7:
                backup_4_seats.append(price_val)

        else: # Xe máy (Logic đơn giản hơn: Giá mở cửa + Giá/km)
            total = 0
            if distance_km <= cfg["base_distance"]: total = cfg["base_fare"]
            else: total = cfg["base_fare"] + ((distance_km - cfg["base_distance"]) * cfg["price_per_km"])
            if is_raining: total *= cfg.get("weather_surge", 1.0)
            prices.append(total)

    # --- FALLBACK (Dự phòng) ---
    # Nếu khách tìm xe 7 chỗ mà DB chưa có giá xe 7 chỗ, lấy giá xe 4 chỗ nhân 1.3
    if not prices and required_seats == 7 and backup_4_seats:
        prices = [p * 1.3 for p in backup_4_seats]

    if not prices: return {"value": 0, "display": "Chưa có giá"}

    # --- TÍNH TRUNG BÌNH & LÀM TRÒN ---
    # [QUAN TRỌNG] Đây là chỗ fix lỗi TypeError hôm trước
    # Cần đảm bảo output là số nguyên, không phải list
    try:
        avg_raw = sum(prices) / len(prices)
        final_price = int(round(avg_raw, -3)) # Làm tròn đến hàng nghìn (VD: 15300 -> 15000)
    except:
        final_price = 0

    # Tạo chuỗi hiển thị (Nếu có nhiều mức giá thì hiện khoảng min-max)
    min_p = int(round(min(prices), -3))
    max_p = int(round(max(prices), -3))

    if min_p == max_p:
        display_str = f"{final_price:,}đ"
    else:
        display_str = f"{min_p:,}~{max_p:,}đ"

    return {"value": final_price, "display": display_str}