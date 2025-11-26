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
    """Kết nối đến SQLite Database an toàn."""
    if not os.path.exists(DB_PATH):
        return None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row 
        return conn
    except Exception as e:
        print(f"❌ [Database Error] {e}")
        return None

# ==============================================================================
# 2. LOAD DỮ LIỆU GIÁ (CACHE VÀO RAM)
# ==============================================================================
# ==============================================================================
# 2. LOAD DỮ LIỆU GIÁ TỪ DB (ĐÃ FIX LỖI TRÙNG KEY Ô TÔ & TÊN HIỂN THỊ)
# ==============================================================================
def load_price_config_from_db():
    config = { "walking": 0, "bus": 7000, "motorbike": {}, "car": {} }
    
    conn = get_db_connection()
    if not conn: return config

    cursor = conn.cursor()

    # 1. Helper: Làm đẹp tên hãng (Logic mới thêm vào)
    def prettify_brand(name):
        if not name: return "Standard"
        name_lower = name.lower().strip()
        
        # Xử lý tên riêng
        if "xanh" in name_lower and "sm" in name_lower:
            return "Xanh SM"
        if name_lower == "be" or name_lower == "bebike" or name_lower == "becar":
            return "Be"
        if name_lower == "grab":
            return "Grab"
        if name_lower == "gojek":
            return "Gojek"
            
        # Các hãng khác viết hoa chữ cái đầu
        return name.title()

    # 2. Helper: Ghép tên hiển thị (Fix lỗi lặp từ + Viết hoa)
    def format_display_name(raw_brand, tier, suffix):
        # Bước 1: Chuẩn hóa tên hãng trước (be -> Be)
        pretty_brand = prettify_brand(raw_brand)
        
        # Bước 2: Ghép chuỗi
        base_name = f"{pretty_brand} {tier}".strip()
        
        # Bước 3: Kiểm tra lặp từ (tránh BeCar Car)
        if suffix.lower() in base_name.lower():
            return base_name
            
        return f"{base_name} {suffix}"

    # A. Load Xe Máy
    try:
        rows = cursor.execute("SELECT * FROM motorbike_pricing").fetchall()
        for row in rows:
            brand = row["brand"] or "Standard"
            tier = row["type"] or "Normal"
            
            # Key dùng để code chạy (giữ nguyên logic cũ)
            key = f"{brand}_{tier}".lower().replace(" ", "")
            
            config["motorbike"][key] = {
                "brand": brand,
                "tier": tier,
                # SỬA: Gọi hàm format mới để tên đẹp hơn
                "display_name": format_display_name(brand, tier, "Bike"), 
                "base_fare": row["base_price"],
                "base_distance": row["base_distance_km"],
                "price_per_km": row["per_km_after_base"],
                "weather_surge": 1.2
            }
    except Exception as e: print(f"⚠️ Lỗi load xe máy: {e}")

    # B. Load Ô tô
    try:
        rows = cursor.execute("SELECT * FROM car_pricing").fetchall()
        for row in rows:
            brand = row["brand"] or "Standard"
            tier = row["type"] or "4cho"
            key = f"{brand}_{tier}".lower().replace(" ", "")
            
            config["car"][key] = {
                "brand": brand,
                "tier": tier,
                # SỬA: Gọi hàm format mới
                "display_name": format_display_name(brand, tier, "Car"),
                "base_fare": row["base_price"],
                "base_distance": row["base_distance_km"],
                "per_km_3_12": row["per_km_3_12"],
                "per_km_13_25": row["per_km_13_25"],
                "per_km_26_plus": row["per_km_26_plus"],
                "weather_surge": 1.4
            }
    except Exception as e: print(f"⚠️ Lỗi load ô tô: {e}")

    conn.close()
    return config

PRICE_CONFIG = load_price_config_from_db()

# ==============================================================================
# 3. CORE: TÍNH TIỀN VÀ TẠO RANGE GIÁ
# ==============================================================================
def calculate_transport_cost(mode, distance_km, is_student=False, is_raining=False, brand_name=None):
    """
    Tính toán chi phí di chuyển.
    - Nếu là Bus/Đi bộ: Trả về giá cố định.
    - Nếu là Xe công nghệ: Trả về khoảng giá Min ~ Max của hãng đó.
    """
    
    # 1. Nhóm giá cố định
    if mode == "walking": return {"value": 0, "display": "Miễn phí"}
    
    if mode == "bus":
        price = 3000 if is_student else 7000
        total = price * 2 if distance_km > 15 else price
        return {"value": total, "display": f"{total:,}đ"}

    # 2. Nhóm Xe công nghệ (Cần gom nhóm tính Range)
    vehicle_group = "motorbike" if "bike" in mode or "motor" in mode else "car"
    all_services = PRICE_CONFIG.get(vehicle_group, {})
    
    if not brand_name: return {"value": 0, "display": "N/A"}

    prices = []
    
    # Lọc tất cả các gói cước thuộc về Hãng này (Brand)
    for key, cfg in all_services.items():
        if cfg['brand'].lower() == brand_name.lower():
            
            # --- Tính giá chi tiết từng gói ---
            total = 0
            
            if vehicle_group == "motorbike":
                if distance_km <= cfg["base_distance"]: 
                    total = cfg["base_fare"]
                else: 
                    extra = distance_km - cfg["base_distance"]
                    total = cfg["base_fare"] + (extra * cfg["price_per_km"])
            
            elif vehicle_group == "car":
                if distance_km <= cfg["base_distance"]: 
                    total = cfg["base_fare"]
                else:
                    remain = distance_km - cfg["base_distance"]
                    total = cfg["base_fare"]
                    
                    # Tính theo bậc thang
                    km_1 = min(remain, 10)
                    total += km_1 * cfg.get("per_km_3_12", 10000)
                    remain -= km_1
                    
                    if remain > 0:
                        km_2 = min(remain, 13)
                        total += km_2 * cfg.get("per_km_13_25", 12000)
                        remain -= km_2
                        
                    if remain > 0:
                        total += remain * cfg.get("per_km_26_plus", 11000)

            # Phụ phí thời tiết
            if is_raining: total *= cfg.get("weather_surge", 1.0)
            
            prices.append(int(total))

    if not prices: return {"value": 0, "display": "Chưa có giá"}

    # --- Tạo chuỗi hiển thị Min ~ Max ---
    min_price = int(round(min(prices), -3))
    max_price = int(round(max(prices), -3))
    avg_price = int(round(sum(prices)/len(prices), -3)) # Giá trị trung bình để chấm điểm AI

    if min_price == max_price:
        display_str = f"~{min_price:,}đ"
    else:
        display_str = f"{min_price:,} ~ {max_price:,}đ"

    return {
        "value": avg_price, 
        "display": display_str
    }