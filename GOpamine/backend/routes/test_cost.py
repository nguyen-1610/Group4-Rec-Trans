import sys
import os

# Import hàm từ file bạn vừa sửa
try:
    from pricing_score import UserRequest, WeatherContext, calculate_adaptive_scores
except ImportError:
    print("❌ Lỗi: Không tìm thấy file 'pricing_score.py'. Hãy đặt file test này cùng thư mục.")
    sys.exit(1)

# Hàm in kết quả cho đẹp
def print_scenario(name, user, dist, weather, traffic_desc):
    print("\n" + "="*60)
    print(f"🧪 SCENARIO: {name}")
    print(f"   - 👥 Khách: {user.passenger_count} người")
    print(f"   - 💰 Budget: {int(user.budget):,}đ")
    print(f"   - ❤️ Ưu tiên: {', '.join(user.priorities) if user.priorities else 'None'}")
    print(f"   - 📍 Quãng đường: {dist} km")
    print(f"   - ⛅ Thời tiết: {'Mưa 🌧️' if weather.is_raining else 'Nắng ☀️'}")
    print(f"   - 🚦 Giao thông: {traffic_desc}")
    print("-" * 60)
    
    # Giả lập giờ cao điểm bằng cách hack giờ hệ thống (Mocking) hoặc chỉ cần tin vào logic code
    # Ở đây ta gọi hàm tính toán
    results = calculate_adaptive_scores(user, dist, weather)
    
    if not results:
        print("⚠️ Không tìm thấy phương tiện nào (Check lại config cost_estimation).")
        return

    print(f"{'HẠNG':<5} | {'PHƯƠNG TIỆN':<25} | {'GIÁ':<12} | {'ĐIỂM SỐ':<10} | {'GHI CHÚ'}")
    print("-" * 75)
    
    for i, res in enumerate(results):
        print(f"#{i+1:<4} | {res['mode_name']:<25} | {res['display_price']:<12} | {res['score']:<10.1f} | {', '.join(res['labels'])}")

# ==============================================================================
# CHẠY TEST CASES
# ==============================================================================

if __name__ == "__main__":
    print("🚀 BẮT ĐẦU TEST LOGIC CHẤM ĐIỂM (V2)...")

    # --------------------------------------------------------------------------
    # CASE 1: 7 NGƯỜI ĐI ĂN TIỆC (MƯA)
    # Kỳ vọng: Loại bỏ hết xe máy, xe 4 chỗ. Chỉ còn Xe 7 chỗ hoặc Bus.
    # --------------------------------------------------------------------------
    req1 = UserRequest(is_student=False, priorities={'comfort', 'speed'}, budget=500000, passenger_count=7)
    ctx1 = WeatherContext(is_raining=True) 
    print_scenario("NHÓM 7 NGƯỜI + TRỜI MƯA", req1, 8.0, ctx1, "Bình thường")

    # --------------------------------------------------------------------------
    # CASE 2: SINH VIÊN ĐI HỌC (BUDGET THẤP)
    # Kỳ vọng: Bus và Xe máy lên ngôi. Oto bị điểm thấp do vượt budget.
    # --------------------------------------------------------------------------
    req2 = UserRequest(is_student=True, priorities={'cheap'}, budget=30000, passenger_count=1)
    ctx2 = WeatherContext(is_raining=False)
    print_scenario("SINH VIÊN (BUDGET 30K)", req2, 5.0, ctx2, "Bình thường")

    # --------------------------------------------------------------------------
    # CASE 3: GIỜ CAO ĐIỂM + CẦN TỐC ĐỘ (RUSH HOUR)
    # Kỳ vọng: Xe máy (Bike) được cộng điểm do luồn lách. Oto bị trừ điểm do tắc đường.
    # Lưu ý: Cần chỉnh giờ máy tính hoặc sửa hàm is_rush_hour() trả về True để test chính xác,
    # nhưng ở đây ta xem logic code xử lý priority 'speed' thế nào.
    # --------------------------------------------------------------------------
    req3 = UserRequest(is_student=False, priorities={'speed'}, budget=200000, passenger_count=1)
    ctx3 = WeatherContext(is_raining=False)
    # Giả định code đang chạy giờ cao điểm (Logic is_rush_hour trong file gốc sẽ quyết định)
    print_scenario("CẦN NHANH (PRIORITY SPEED)", req3, 6.0, ctx3, "Tùy thuộc giờ hiện tại")