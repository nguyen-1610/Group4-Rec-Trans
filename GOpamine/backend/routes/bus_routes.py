from flask import Blueprint, request, jsonify
import sys
import os
import traceback # Thêm thư viện này để in lỗi chi tiết

# --- HACK PATH (Giữ nguyên để import được) ---
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
if project_root not in sys.path:
    sys.path.append(project_root)
# ---------------------------------------------

from backend.utils.bus_routing import find_smart_bus_route

bus_bp = Blueprint('bus_api', __name__, url_prefix='/api/bus')

@bus_bp.route('/find', methods=['POST'])
def find_route():
    print("\n-------------------------------------------------")
    print("📡 [API REQUEST] Đã nhận yêu cầu tìm bus!")
    
    try:
        # 1. Kiểm tra dữ liệu đầu vào
        data = request.get_json()
        print(f"📦 Data received: {data}")
        
        start = data.get('start') 
        end = data.get('end')
        
        if not start or not end:
            print("❌ Lỗi: Thiếu start hoặc end")
            return jsonify({'success': False, 'error': 'Thiếu tọa độ start/end'})

        print(f"📍 Start: {start}")
        print(f"📍 End: {end}")

        # 2. Gọi thuật toán
        print("⚙️ Đang gọi hàm find_smart_bus_route...")
        result = find_smart_bus_route(start, end)
        
        print("✅ Kết quả trả về từ thuật toán:")
        print(result) # In kết quả ra xem có bị None không
        
        return jsonify(result)

    except Exception as e:
        print("❌ [API CRASH] Lỗi nghiêm trọng xảy ra:")
        traceback.print_exc() # In toàn bộ vết lỗi ra Terminal
        return jsonify({'success': False, 'error': f"Server Error: {str(e)}"})