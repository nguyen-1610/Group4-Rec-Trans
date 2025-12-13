# File: backend/routes/transport_routes.py
from flask import Blueprint, request, jsonify # Import các công cụ cần thiết của Flask để tạo API
import sys # Thư viện tương tác với hệ thống (dùng để sửa đường dẫn import nếu cần)
import os  # Thư viện tương tác với hệ điều hành

# --- IMPORT MODULE ---
# Vì file này nằm cùng thư mục 'routes', ta thử import trực tiếp module logic
try:
    import pricing_score # Thử import module pricing_score (chứa thuật toán tính điểm)
except ImportError:
    # Nếu import trực tiếp thất bại (thường do chạy từ thư mục mẹ), dùng import tương đối với dấu chấm (.)
    from . import pricing_score

# Tạo một Blueprint tên là 'transport_bp'. Blueprint giúp tổ chức code Flask gọn gàng hơn.
transport_bp = Blueprint('transport_bp', __name__)

# Định nghĩa đường dẫn API: /api/compare-transport, chỉ chấp nhận phương thức POST
@transport_bp.route('/api/compare-transport', methods=['POST'])
def compare_transport():
    """API tính điểm và giá cho 4 loại phương tiện"""
    try: # Bắt đầu khối try để bắt lỗi nếu có sự cố xảy ra
        
        # 1. Kiểm tra module logic đã được load chưa
        if not pricing_score:
            # Nếu chưa load được module logic thì trả về lỗi ngay lập tức để tránh crash
            return jsonify({'success': True, 'data': [], 'message': 'Module logic chưa load'})

        # Lấy dữ liệu JSON từ request mà Frontend gửi lên (map_trans.js)
        data = request.get_json()
        
        # 🔧 FIX 1: Debug toàn bộ dữ liệu nhận được
        # In ra màn hình console của server để kiểm tra xem Frontend gửi đúng hay sai
        print("\n" + "="*60)
        print("📦 [API RECEIVED] Raw data:")
        print(f"   {data}") # In toàn bộ cục data thô
        print("="*60)

        # 🔧 FIX 2: Xử lý distance_km (Khoảng cách)
        try:
            # Lấy 'distance_km', nếu không có (None/Empty) thì lấy mặc định là 0, sau đó ép kiểu sang float
            distance_km = float(data.get('distance_km') or 0)
        except:
            # Nếu ép kiểu lỗi (ví dụ gửi chữ "abc"), gán mặc định là 0.0 để không crash
            distance_km = 0.0
        print(f"✅ distance_km: {distance_km}") # Log kết quả khoảng cách đã xử lý

        # 🔧 FIX 3: Xử lý priorities (Danh sách ưu tiên)
        # Lấy 'priorities', nếu không có thì mặc định lấy ['saving', 'speed']
        priorities = data.get('priorities') or ['saving', 'speed']
        
        # Kiểm tra nếu priorities là chuỗi (string) thay vì danh sách (list)
        if isinstance(priorities, str):
            # Nếu là string (ví dụ "saving, speed"), tách nó ra thành list bằng dấu phẩy
            priorities = [p.strip() for p in priorities.split(',')]
        print(f"✅ priorities: {priorities}") # Log kết quả ưu tiên

        # 🔧 FIX 4: Xử lý passengers (Số khách)
        try:
            # Lấy 'passengers', nếu không có thì mặc định là 1
            raw_passengers = data.get('passengers') or 1
            # Ép kiểu sang số nguyên (int)
            passengers = int(raw_passengers)
            # Nếu số khách <= 0 (vô lý), gán lại bằng 1
            if passengers <= 0: passengers = 1
        except:
            # Nếu lỗi ép kiểu, mặc định là 1
            passengers = 1
        print(f"✅ passengers: {passengers}") # Log số khách

        # 🔧 FIX 5: Xử lý budget (NGÂN SÁCH - PHẦN QUAN TRỌNG NHẤT)
        try:
            # Lấy giá trị budget thô từ dữ liệu gửi lên
            raw_budget = data.get('budget')
            # In ra kiểu dữ liệu của budget để debug (xem nó là int, str hay NoneType)
            print(f"🔍 [DEBUG] raw_budget: '{raw_budget}' (Type: {type(raw_budget).__name__})")
            
            # Bắt đầu các trường hợp xử lý:
            
            # Trường hợp 1: Frontend không gửi budget (None)
            if raw_budget is None:
                budget = None # Gán None -> pricing_score sẽ tự hiểu là 10 triệu
                print(f"🔍 [DEBUG] budget = None (will be 10M in UserRequest)")
            
            # Trường hợp 2: Budget là chuỗi ký tự (String)
            elif isinstance(raw_budget, str):
                raw_clean = raw_budget.strip() # Xóa khoảng trắng thừa
                
                # Nếu chuỗi rỗng "" HOẶC chuỗi là "0"
                if raw_clean == "" or raw_clean == "0":
                    budget = None # Coi như không giới hạn ngân sách (fallback về 10 triệu)
                else:
                    budget = float(raw_clean) # Ép kiểu sang số thực
                    print(f"🔍 [DEBUG] Converted string to float: {budget}")
            
            # Trường hợp 3: Budget là số (int hoặc float)
            else:
                # Nếu raw_budget có giá trị (khác 0) thì ép kiểu float, nếu bằng 0 thì gán None
                budget = float(raw_budget) if raw_budget else None
                print(f"🔍 [DEBUG] Direct float conversion: {budget}")
                
        except Exception as e:
            # Nếu có bất kỳ lỗi gì khi xử lý budget, in lỗi ra và gán budget = None (an toàn)
            print(f"⚠️ [DEBUG] Error parsing budget: {e}")
            budget = None

        print(f"✅ Final budget sent to UserRequest: {budget}\n") # Log giá trị budget cuối cùng chốt lại

        # 🔧 FIX 6: Tạo UserRequest & tính toán
        # Lấy thông tin thời tiết thực tế
        weather_ctx = pricing_score.get_real_weather_context()
        
        # Khởi tạo đối tượng UserRequest với các thông tin đã được làm sạch ở trên
        # Lưu ý: Class này nằm trong file pricing_score.py
        user_req = pricing_score.UserRequest(
            priorities=priorities,
            budget=budget,          # Budget đã xử lý (None hoặc số tiền)
            passenger_count=passengers
        )

        # Gọi hàm tính toán điểm số cho các phương tiện
        results = pricing_score.calculate_adaptive_scores(
            user_req, distance_km, weather_ctx, traffic_level=0.5
        )

        # In log thông báo thành công và số lượng kết quả tìm được
        print(f"✅ [API SUCCESS] Returned {len(results)} results\n")
        
        # Trả về kết quả JSON cho Frontend
        return jsonify({'success': True, 'data': results})

    except Exception as e:
        # Nếu có lỗi sập server (Exception), in chi tiết lỗi ra console
        print(f"❌ Error in transport_bp: {e}")
        import traceback
        traceback.print_exc() # In toàn bộ vết lỗi (Stack trace) để dễ debug
        # Trả về mã lỗi 500 cho Frontend biết
        return jsonify({'success': False, 'error': str(e)}), 500