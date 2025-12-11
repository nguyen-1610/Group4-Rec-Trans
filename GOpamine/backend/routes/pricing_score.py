import os  # Thư viện tương tác với hệ điều hành (lấy biến môi trường, đường dẫn...)
import sys  # Thư viện tương tác với hệ thống Python (kiểm tra modules đã load...)
import math  # Thư viện toán học (làm tròn...)
from datetime import datetime  # Thư viện xử lý ngày giờ (để check giờ cao điểm)

# ==============================================================================
# 1. SETUP & IMPORT
# ==============================================================================
try:
    import cost_estimation  # Thử import module tính giá (nằm cùng thư mục)
    import real_times  # Thử import module thời tiết/thời gian thực
except ImportError:  # Nếu lỗi (do chạy từ thư mục khác cấu trúc)
    try:
        from . import cost_estimation  # Thử import với dấu chấm (relative import)
        from . import real_times
    except ImportError:  # Nếu vẫn không được (thiếu file)
        cost_estimation = None  # Gán None để code không bị crash, chỉ tắt tính năng này
        real_times = None

# ==============================================================================
# 2. CẤU HÌNH (CONSTANTS)
# ==============================================================================
# Bảng cấu hình tốc độ (km/h) cho từng loại xe trong 2 trường hợp: Bình thường & Cao điểm
SPEED_CONFIG = {
    'walking': {'normal': 5,  'rush': 5},   # Đi bộ: Tốc độ không đổi (5km/h)
    'bus':     {'normal': 25, 'rush': 15},  # Bus: Giảm mạnh khi kẹt xe
    'bike':    {'normal': 30, 'rush': 22},  # Xe máy: Nhanh, ít bị ảnh hưởng hơn
    'car':     {'normal': 25, 'rush': 13}   # Ô tô: Dễ bị kẹt cứng nhất khi cao điểm
}

# ==============================================================================
# 3. CLASS DEFINITIONS
# ==============================================================================
class UserRequest:  # Class chứa thông tin người dùng gửi lên
    def __init__(self, is_student, priorities, budget=None, passenger_count=1):
        self.is_student = is_student  # Check xem có phải sinh viên không (để giảm giá bus)
        self.priorities = set(priorities) if priorities else set()  # Lưu các ưu tiên (nhanh, rẻ...) vào set để tra cứu
        # Xử lý ngân sách: Nếu không nhập hoặc nhập sai thì mặc định là 10 triệu (coi như vô hạn)
        self.budget = float(budget) if budget and float(budget) > 0 else 10_000_000
        self.passenger_count = int(passenger_count)  # Số lượng hành khách

class WeatherContext:  # Class chứa thông tin thời tiết
    def __init__(self, is_raining=False, is_hot=False, desc=None):
        self.is_raining = is_raining  # True nếu đang mưa
        self.is_hot = is_hot          # True nếu đang nắng nóng
        self.desc = desc              # Mô tả chi tiết (VD: "Mưa nhẹ")

# ==============================================================================
# 4. HELPER FUNCTIONS
# ==============================================================================
def is_rush_hour():  # Hàm kiểm tra giờ cao điểm
    now = datetime.now()  # Lấy thời gian hiện tại
    current_time = now.hour + (now.minute / 60)  # Đổi giờ phút ra số thập phân (VD: 16h30 -> 16.5)
    # Sáng: 7h-9h HOẶC Chiều: 16h30-18h30
    if (7 <= current_time < 9) or (16.5 <= current_time < 18.5):
        return True  # Là giờ cao điểm
    return False  # Không phải giờ cao điểm

def get_real_weather_context():  # Hàm lấy dữ liệu thời tiết thực tế từ API
    ctx = WeatherContext()  # Tạo object mặc định (không mưa, không nóng)
    if 'real_times' in sys.modules and real_times:  # Kiểm tra module real_times có tồn tại không
        api_key = os.getenv("OPENWEATHER_API_KEY")   # Lấy API Key từ biến môi trường
        try:
            data = real_times.fetch_weather_realtime(api_key)  # Gọi hàm fetch thời tiết
            if data.get("success"):  # Nếu gọi API thành công
                ctx.is_raining = data.get("dang_mua", False)  # Cập nhật trạng thái mưa
                ctx.is_hot = data.get("nhiet_do", 30) > 35    # Nếu > 35 độ thì coi là nóng
                ctx.desc = data.get("mo_ta", "")              # Lấy mô tả thời tiết
        except Exception: pass  # Nếu lỗi mạng/API thì bỏ qua, dùng mặc định
    return ctx  # Trả về object thời tiết

# ==============================================================================
# 5. MODULE 1: GET MODES
# ==============================================================================
def _get_all_modes(trip_distance):  # Hàm tạo danh sách các phương tiện khả thi
    modes = []
    # 1. Đi bộ & Bus (Luôn có sẵn)
    if trip_distance < 3.0:   # Chỉ gợi ý đi bộ nếu dưới 3km
        modes.append({'name': 'Đi bộ', 'type': 'walk', 'map_key': 'walking', 'capacity': 1, 'has_roof': False})
    modes.append({'name': 'Xe buýt', 'type': 'bus', 'map_key': 'bus', 'capacity': 50, 'has_roof': True})

    # 2. Xe công nghệ (Lấy từ Config trong DB)
    if cost_estimation:  # Nếu module giá hoạt động
        config = cost_estimation.PRICE_CONFIG  # Lấy biến cấu hình giá
        available_services = {}   # Dict lưu các dịch vụ theo hãng (Brand)
        
        # Duyệt qua các loại xe máy trong config
        for cfg in config.get("motorbike", {}).values():
            brand = cfg['brand']  # Tên hãng (Grab, Be...)
            if brand not in available_services: available_services[brand] = set()
            available_services[brand].add('bike')  # Đánh dấu hãng này có Bike
            
        # Duyệt qua các loại ô tô trong config
        for cfg in config.get("car", {}).values():
            brand = cfg['brand']
            seats = cfg.get('seats', 4)  # Lấy số ghế (mặc định 4)
            if brand not in available_services: available_services[brand] = set()
            if seats >= 7: available_services[brand].add('car_7')  # Đánh dấu có xe 7 chỗ
            else: available_services[brand].add('car_4')           # Đánh dấu có xe 4 chỗ

        # Tổng hợp lại thành danh sách modes hoàn chỉnh
        for brand, services in available_services.items():
            # Xử lý tên hiển thị cho đẹp (VD: bỏ chữ "bike" thừa, sửa tên XanhSM)
            clean_brand = brand if "bike" not in brand.lower() else brand.split()[0]
            if "xanh" in clean_brand.lower(): clean_brand = "Xanh SM"

            if 'bike' in services:  # Thêm mode Bike
                modes.append({'name': f"{clean_brand} Bike", 'type': 'bike', 'map_key': 'ride_hailing_bike', 'capacity': 1, 'has_roof': False, 'brand': brand})
            if 'car_4' in services: # Thêm mode Car 4 chỗ
                modes.append({'name': f"{clean_brand} Car (4 chỗ)", 'type': 'car', 'map_key': 'ride_hailing_car_4', 'capacity': 4, 'has_roof': True, 'brand': brand})
            if 'car_7' in services: # Thêm mode Car 7 chỗ
                modes.append({'name': f"{clean_brand} Car (7 chỗ)", 'type': 'car', 'map_key': 'ride_hailing_car_7', 'capacity': 7, 'has_roof': True, 'brand': brand})
    return modes

# ==============================================================================
# 6. HARD CONSTRAINTS
# ==============================================================================
def _check_hard_constraints(mode, user):  # Hàm kiểm tra điều kiện cứng (Bắt buộc)
    if mode['type'] == 'bus': return True  # Bus luôn đi được (không lo quá tải 1 xe)
    if user.passenger_count > mode['capacity']: return False  # Nếu số người > số ghế xe -> Loại bỏ
    return True

# ==============================================================================
# 7. MODULE 2: CALCULATOR
# ==============================================================================
def _calculate_metrics(mode, user, distance_km, weather_ctx):  # Hàm tính toán giá và thời gian
    unit_price = 0
    display_str = "0đ"
    
    # Tính giá tiền (nếu không phải đi bộ)
    if cost_estimation and mode['type'] != 'walk':
        res = cost_estimation.calculate_transport_cost(  # Gọi hàm tính giá bên file cost_estimation
            mode=mode['map_key'], distance_km=distance_km, is_student=user.is_student,
            is_raining=weather_ctx.is_raining, brand_name=mode.get('brand')
        )
        # Lấy giá trị số (value) và chuỗi hiển thị (display)
        unit_price = res['value'] if isinstance(res, dict) else float(res)
        display_str = res['display'] if isinstance(res, dict) else f"{int(res):,}đ"

    # Tính tổng tiền: Bus nhân theo người, còn lại tính theo chuyến
    if mode['type'] == 'bus': total_cost = unit_price * user.passenger_count
    else: total_cost = unit_price 

    # Tính giá chia đầu người
    price_per_person = total_cost / user.passenger_count if user.passenger_count > 0 else 0

    # Tính thời gian dựa trên giờ cao điểm
    is_peak = is_rush_hour()
    traffic_mode = 'rush' if is_peak else 'normal'  # Chọn chế độ 'rush' hoặc 'normal'
    
    speed_key = 'walking' if mode['type'] == 'walk' else mode['type']  # Lấy key tốc độ
    if speed_key not in SPEED_CONFIG: speed_key = 'car'  # Fallback về 'car' nếu không tìm thấy key
    
    speed_kmh = SPEED_CONFIG[speed_key][traffic_mode]  # Tra bảng tốc độ
    duration = int((distance_km / max(speed_kmh, 1)) * 60)  # Công thức: (Quãng đường / Vận tốc) * 60 phút
    
    # Riêng đi bộ tính cố định 5km/h (ghi đè logic trên cho chắc)
    if mode['type'] == 'walk': duration = int((distance_km / 5.0) * 60)

    # Trả về tất cả thông số
    return {
        "mode": mode, "total_cost": total_cost, "price_per_person": price_per_person,
        "display_str": display_str, "duration": duration, "is_peak": is_peak
    }

# ==============================================================================
# 8. MODULE 3: CHẤM ĐIỂM (BRAND-SPECIFIC LOGIC)
# ==============================================================================
def _compute_score(metrics, user, distance_km, weather_ctx):  # Hàm chấm điểm (Quan trọng nhất)
    mode = metrics['mode']
    price = metrics['total_cost']
    mode_type = mode['type'] # Loại xe: 'bus', 'bike', 'car', 'walk'
    brand = str(mode.get('brand', '')).lower() # Tên hãng (viết thường)
    is_peak = metrics['is_peak']
    
    score = 0.0  # Điểm khởi đầu
    
    # ⭐ 1) PRICE SCORE (ĐIỂM GIÁ) - Tối đa 3.0 điểm
    price_percent = price / user.budget  # Tỷ lệ giá / ngân sách
    if price_percent < 0.05:      score += 3.0  # Rất rẻ (< 5% ngân sách)
    elif price_percent < 0.10:    score += 2.5
    elif price_percent < 0.20:    score += 1.8
    elif price_percent < 0.40:    score += 1.0
    else:                         score += 0.2  # Đắt (> 40% ngân sách)
    
    # ⭐ 2) PRIORITY SCORING (ĐIỂM ƯU TIÊN)
    
    # --- A. ƯU TIÊN TỐC ĐỘ (SPEED) ---
    # Logic xếp hạng: Gojek > Grab > Be > Car > Bus
    if 'speed' in user.priorities:
        # Nhóm Bike (Xe máy)
        if mode_type == 'bike':
            score += 1.0 # Điểm sàn cho xe máy
            if 'gojek' in brand:  score += 0.5  # Gojek được buff điểm tốc độ cao nhất
            elif 'grab' in brand: score += 0.3  # Grab nhì
            elif 'be' in brand:   score += 0.1  # Be ba
        
        # Nhóm Car (Ô tô)
        elif mode_type == 'car':
            score += 0.4 # Điểm sàn ô tô thấp hơn xe máy
            # Grab/XanhSM thường bắt xe nhanh hơn Taxi
            if 'grab' in brand or 'xanh' in brand: score += 0.1

        # Nhóm chậm (Bus/Đi bộ) -> Trừ điểm
        elif mode_type == 'bus':  score -= 0.6
        elif mode_type == 'walk': score -= 1.0
        
        # Phạt nặng ô tô nếu đang kẹt xe (is_peak)
        if is_peak and mode_type == 'car': score -= 0.8
            
    # --- B. ƯU TIÊN RẺ (CHEAP/BUDGET) ---
    # Logic xếp hạng: Be > Bus > Gojek > Grab
    if 'cheap' in user.priorities or 'budget' in user.priorities:
        # Cộng điểm hãng rẻ (Tâm lý thích thương hiệu bình dân)
        if 'be' in brand:      score += 0.8  # Be thường rẻ/nhiều mã
        elif mode_type == 'bus': score += 0.6 # Bus siêu rẻ
        elif 'gojek' in brand: score += 0.4 
        elif 'grab' in brand:  score += 0.2  # Grab thường đắt hơn
        
        # Phạt xe hơi nếu muốn rẻ (vì ô tô chắc chắn đắt)
        if mode_type == 'car': score -= 0.5
        
    # --- C. ƯU TIÊN THOẢI MÁI (COMFORT) ---
    # Logic xếp hạng: GrabCar > XanhSM > BeCar > Bike
    if 'comfort' in user.priorities:
        if mode_type == 'car':
            score += 1.0 # Base Car
            if 'grab' in brand:     score += 0.5  # GrabCar thường xịn/sạch
            elif 'xanh' in brand:   score += 0.4  # XanhSM xe điện êm
            elif 'be' in brand:     score += 0.2  # BeCar
        
        elif mode_type == 'bus':  score += 0.3  # Bus có máy lạnh
        elif mode_type == 'bike': score -= 0.8  # Xe máy bụi bặm -> Trừ điểm
        elif mode_type == 'walk': score -= 1.0
        
        if is_peak and mode_type == 'car': score -= 0.2 # Kẹt xe ngồi lâu cũng mệt
        
    # ⭐ 3) THỜI TIẾT (MƯA)
    # Logic: Car > Bus >> Bike (Mưa thì đi ô tô là nhất)
    if weather_ctx.is_raining:
        if mode_type == 'car':    score += 0.5       # Cộng điểm
        elif mode_type == 'bus':  score -= 0.5       # Trừ nhẹ (phải đi bộ ra bến)
        elif mode_type == 'bike': score -= 2.5       # Trừ rất nặng (ướt)
        elif mode_type == 'walk': score -= 3.0       # Trừ kịch khung
    
    # ⭐ 4) KHOẢNG CÁCH & SOLO (ĐI MỘT MÌNH)
    if distance_km > 20:  # Nếu đi xa > 20km
        if mode_type in ['bike', 'walk']: score -= 1.5  # Xe máy/Đi bộ cực mệt -> Trừ điểm
        if mode_type == 'car': score += 0.5             # Ô tô đi xa khỏe -> Cộng điểm

    # Nếu đi 1 mình mà gọi xe 7 chỗ -> Lãng phí -> Trừ điểm
    if user.passenger_count == 1 and mode_type == 'car' and mode['capacity'] >= 7:
        score -= 0.5 

    # Cộng điểm cơ bản (Base score) để không bị âm quá
    score += 4.0 

    # Kẹp điểm trong khoảng 0.0 đến 10.0
    final_score = max(0.0, min(10.0, score))
    return round(final_score, 1)

# ==============================================================================
# 9. MODULE 4: GÁN NHÃN
# ==============================================================================
def _generate_labels(metrics, score, weather_ctx, distance_km):  # Hàm tạo nhãn (tag) hiển thị
    mode = metrics['mode']
    labels = []
    brand_name = str(mode.get('brand', '')).lower()
    
    # Nhãn cảnh báo
    if metrics['is_peak'] and mode['type'] == 'car': labels.append("🚦 Dễ kẹt")  # Cảnh báo kẹt xe
    if weather_ctx.is_raining and mode['type'] == 'bike': labels.append("🌧️ Mặc áo mưa") # Cảnh báo mưa
    
    if score >= 8.5: labels.append("⭐ Gợi ý tốt") # Nếu điểm cao -> Gắn nhãn gợi ý
    
    # Nhãn Brand đặc trưng (Marketing points)
    if 'be' in brand_name: labels.append("💸 Nhiều ưu đãi")
    if 'xanh' in brand_name: labels.append("🌿 Xe điện êm")
    if 'gojek' in brand_name and mode['type'] == 'bike': labels.append("🚀 Tài xế nhanh")
        
    return labels

# ==============================================================================
# 10. MAIN FUNCTION
# ==============================================================================
def calculate_adaptive_scores(user, trip_distance, weather_ctx, traffic_level=0.5):  # Hàm chính
    modes = _get_all_modes(trip_distance)  # B1: Lấy danh sách xe
    if not modes: return []

    results = []
    for mode in modes:
        if not _check_hard_constraints(mode, user):  # B2: Lọc cứng (VD: quá số người)
            continue 

        # B3: Tính toán chỉ số (Tiền, Thời gian...)
        metrics = _calculate_metrics(mode, user, trip_distance, weather_ctx)
        # B4: Chấm điểm
        score = _compute_score(metrics, user, trip_distance, weather_ctx)
        # B5: Tạo nhãn
        labels = _generate_labels(metrics, score, weather_ctx, trip_distance)

        # Đóng gói kết quả
        results.append({
            "mode_name": metrics['mode']['name'],
            "total_price": int(metrics['total_cost']),
            "price_per_person": int(metrics['price_per_person']),
            "display_price": metrics['display_str'],
            "duration": metrics['duration'],
            "vehicles_needed": 1,  # Đang giả định 1 xe (cần cải thiện logic nhiều xe sau)
            "score": score,
            "labels": labels,
            "details": { "is_peak": metrics['is_peak'] }
        })

# Sắp xếp kết quả từ điểm cao xuống thấp (reverse=True)
    return sorted(results, key=lambda x: x['score'], reverse=True)