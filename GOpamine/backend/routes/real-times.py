import os
import requests
from dotenv import load_dotenv

# Load file .env
load_dotenv()

# Lấy key từ môi trường (An toàn tuyệt đối)
WEATHER_KEY = os.getenv("OPENWEATHER_API_KEY")
TRAFFIC_KEY = os.getenv("TOMTOM_API_KEY")

# ==============================================================================
# 1. HÀM GỌI API THỜI TIẾT (OPENWEATHERMAP)
# ==============================================================================
def fetch_weather_realtime(api_key, city="Ho Chi Minh City"):
    """
    Gọi API lấy thời tiết thực tế.
    Trả về: Dictionary chứa thông tin nhiệt độ, mô tả, trạng thái mưa.
    """
    # URL chuẩn của OpenWeatherMap
    url = "http://api.openweathermap.org/data/2.5/weather"
    
    params = {
        'q': city,
        'appid': api_key,
        'units': 'metric', # Độ C
        'lang': 'vi'       # Tiếng Việt
    }

    print(f"☁️ Đang gọi API thời tiết cho {city}...")
    
    try:
        response = requests.get(url, params=params, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            return {
                "success": True,
                "mo_ta": data['weather'][0]['description'].capitalize(),
                "nhiet_do": data['main']['temp'],
                "do_am": data['main']['humidity'],
                # Kiểm tra xem trong data có key 'rain' hoặc từ khóa mưa trong mô tả không
                "dang_mua": 'rain' in data or 'mưa' in data['weather'][0]['description'].lower()
            }
        else:
            return {"success": False, "error": f"Lỗi API: {response.status_code}"}
            
    except Exception as e:
        return {"success": False, "error": str(e)}

# ==============================================================================
# 2. HÀM GỌI API GIAO THÔNG (TOMTOM)
# ==============================================================================
def fetch_traffic_realtime(api_key, lat=10.7769, lon=106.7009):
    """
    Gọi API TomTom Flow lấy tốc độ thực tế tại tọa độ (Mặc định: Q1, TP.HCM).
    """
    # URL chuẩn của TomTom Flow Segment
    url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
    
    params = {
        'key': api_key,
        'point': f"{lat},{lon}"
    }

    print("🚦 Đang gọi API giao thông TomTom...")

    try:
        response = requests.get(url, params=params, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            flow = data.get('flowSegmentData', {})
            
            current_speed = flow.get('currentSpeed', 0)
            free_speed = flow.get('freeFlowSpeed', 0)
            
            # Tính tỷ lệ kẹt xe (Nếu tốc độ hiện tại < 60% tốc độ thoáng => Kẹt)
            ratio = current_speed / free_speed if free_speed > 0 else 1.0
            is_congested = ratio < 0.6
            
            status_text = "Kẹt xe" if is_congested else "Thông thoáng"
            if ratio < 0.3: status_text = "Kẹt xe nghiêm trọng"

            return {
                "success": True,
                "toc_do": current_speed,
                "trang_thai": status_text,
                "co_ket_xe": is_congested
            }
        else:
            return {"success": False, "error": f"Lỗi API: {response.status_code}"}

    except Exception as e:
        return {"success": False, "error": str(e)}

# ==============================================================================
# 3. THUẬT TOÁN TƯ VẤN (CORE ALGORITHM)
# ==============================================================================
def get_advising_context():
    """
    Hàm chính: Tổng hợp dữ liệu API thật -> Tạo lời khuyên (Prompt Context).
    """
    print("\n>>> BẮT ĐẦU CHẠY THUẬT TOÁN REAL-TIME <<<\n")

    # --- BƯỚC 1: Lấy dữ liệu ---
    weather_data = fetch_weather_realtime(WEATHER_KEY)
    traffic_data = fetch_traffic_realtime(TRAFFIC_KEY)

    # --- BƯỚC 2: Xử lý Logic (Rules) ---
    advices = []
    info_lines = []

    # Xử lý Thời tiết
    if weather_data["success"]:
        info_lines.append(f"- Thời tiết: {weather_data['mo_ta']}, {weather_data['nhiet_do']}°C.")
        
        if weather_data['dang_mua']:
            advices.append("🌧️ [LUẬT MƯA]: Trời đang mưa. Ưu tiên gợi ý Taxi/Grab/Bus. Cảnh báo khách sẽ bị ướt nếu đi xe máy.")
        elif weather_data['nhiet_do'] > 34:
            advices.append("☀️ [LUẬT NẮNG]: Trời nắng nóng. Nhắc khách hạn chế đi bộ đường dài.")
    else:
        info_lines.append(f"- Thời tiết: Không lấy được dữ liệu ({weather_data.get('error')}).")

    # Xử lý Giao thông
    if traffic_data["success"]:
        info_lines.append(f"- Giao thông: {traffic_data['trang_thai']} (Tốc độ: {traffic_data['toc_do']} km/h).")
        
        if traffic_data['co_ket_xe']:
            advices.append("🚗 [LUẬT KẸT XE]: Đang kẹt xe. Khuyên khách dự trù thêm thời gian hoặc đi xe máy để linh hoạt hơn ô tô.")
    else:
        info_lines.append(f"- Giao thông: Không lấy được dữ liệu ({traffic_data.get('error')}).")

    # --- BƯỚC 3: Tạo Context String ---
    # Đây là chuỗi văn bản cuối cùng bạn sẽ gửi cho Gemini
    final_context = f"""
    [DỮ LIỆU THỜI GIAN THỰC - {datetime.now().strftime('%H:%M %d/%m/%Y')}]
    {chr(10).join(info_lines)}

    [CHỈ THỊ HỆ THỐNG]:
    {chr(10).join(advices) if advices else "Mọi thứ ổn định, tư vấn lộ trình bình thường."}
    """
    
    return final_context

# ==============================================================================
# TEST TRỰC TIẾP (Khi chạy file này)
# ==============================================================================
if __name__ == "__main__":
    # Yêu cầu cài đặt thư viện: pip install requests
    
    result = get_advising_context()
    
    print("\n" + "="*60)
    print("KẾT QUẢ OUTPUT (CONTEXT GỬI CHO AI):")
    print("="*60)
    print(result)
    print("="*60)