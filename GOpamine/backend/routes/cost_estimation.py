import sqlite3
import os
import sys

# ==============================================================================
# PHẦN 1: CẤU HÌNH KẾT NỐI DATABASE (ĐÃ SỬA CHO CẤU TRÚC MỚI)
# ==============================================================================

# 1. Xác định vị trí file DB (Leo ra khỏi folder routes -> backend -> GOPamine)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(CURRENT_DIR, '../../database/vehicle.db'))

# 2. Hàm lấy cấu hình giá từ DB (Thay thế cho việc import từ utils)
def load_price_config():
    # Cấu hình mặc định (Backup nếu DB lỗi)
    config = {
        "walking": {"price": 0},
        "bus": {"ticket_normal": 6000, "ticket_student": 3000},
        "ride_hailing_bike": {"base_fare": 12500, "base_distance": 2, "price_per_km": 4300, "weather_surge": 1.3},
        "ride_hailing_car": {"base_fare": 27000, "base_distance": 2, "price_per_km": 9500, "weather_surge": 1.5}
    }

    if not os.path.exists(DB_PATH):
        print(f"⚠️ [Cost] Không tìm thấy DB tại {DB_PATH}, dùng giá mặc định.")
        return config

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Lấy giá Xe Máy (Lấy dòng đầu tiên làm chuẩn)
        row_bike = cursor.execute("SELECT * FROM motorbike_pricing LIMIT 1").fetchone()
        if row_bike:
            config["ride_hailing_bike"] = {
                "base_fare": row_bike["base_price"],
                "base_distance": row_bike["base_distance_km"],
                "price_per_km": row_bike["per_km_after_base"],
                "weather_surge": 1.3
            }

        # Lấy giá Ô tô (Lấy dòng đầu tiên)
        row_car = cursor.execute("SELECT * FROM car_pricing LIMIT 1").fetchone()
        if row_car:
            # Map các trường trong DB vào dictionary cấu hình
            config["ride_hailing_car"] = {
                "base_fare": row_car["base_price"],
                "base_distance": row_car["base_distance_km"],
                "price_per_km": row_car["per_km_3_12"], # Lấy mức giá trung bình
                "weather_surge": 1.5
            }
        
        conn.close()
        print(f"✅ [Cost] Đã load giá từ DB: {DB_PATH}")
    except Exception as e:
        print(f"❌ [Cost] Lỗi đọc DB: {e}, dùng giá mặc định.")

    return config

# ==============================================================================
# PHẦN 2: KHỞI TẠO CONFIG (CHẠY 1 LẦN)
# ==============================================================================
PRICE_CONFIG = load_price_config()

# ==============================================================================
# PHẦN 3: THUẬT TOÁN TÍNH TIỀN (GIỮ NGUYÊN CỦA BẠN 100%)
# ==============================================================================
def calculate_transport_cost(mode, distance_km, is_student=False, is_raining=False):
    """
    Trả về Dict: {'value': số_nguyên, 'display': 'chuỗi_hiển_thị'}
    """
    # 1. Đi bộ
    if mode == "walking":
        return {"value": 0, "display": "Miễn phí"}
        
    # 2. Xe buýt
    elif mode == "bus":
        num_trips = 2 if distance_km > 15 else 1
        ticket = PRICE_CONFIG["bus"]["ticket_student"] if is_student else PRICE_CONFIG["bus"]["ticket_normal"]
        total = ticket * num_trips
        return {"value": total, "display": f"{total:,}VND"} # Bus thì giá cố định, không cần dấu ngã

    # 3. Xe công nghệ
    elif mode in ["ride_hailing_bike", "ride_hailing_car"]:
        cfg = PRICE_CONFIG.get(mode)
        if not cfg: 
            return {"value": 0, "display": "N/A"}
        
        # Tính giá
        if distance_km <= cfg["base_distance"]:
            total = cfg["base_fare"]
        else:
            extra = distance_km - cfg["base_distance"]
            total = cfg["base_fare"] + (extra * cfg["price_per_km"])
            
        # Tính mưa
        if is_raining:
            total *= cfg["weather_surge"]
            
        # --- LOGIC LÀM TRÒN & DẤU NGÃ ---
        # Làm tròn đến hàng nghìn (Ví dụ: 15200 -> 15000)
        rounded_total = int(round(total, -3))
        
        # Thêm dấu ngã ~ vì đây là giá ước tính
        return {
            "value": rounded_total,
            "display": f"~{rounded_total:,}VND"
        }

    return {"value": 0, "display": "0VND"}