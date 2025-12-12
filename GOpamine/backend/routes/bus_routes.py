from flask import Blueprint, request, jsonify
import sys
import os
import traceback # Thêm thư viện này để in lỗi chi tiết
from backend.utils.bus_routing import get_db, validate_route_quality, get_route_name
from supabase_client import supabase

# --- HACK PATH (Giữ nguyên để import được) ---
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
if project_root not in sys.path:
    sys.path.append(project_root)
# ---------------------------------------------

from backend.utils.bus_routing import find_smart_bus_route, plan_multi_stop_bus_trip

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
    
@bus_bp.route('/plan-multi-trip', methods=['POST'])
def plan_multi_trip():
    print("\n-------------------------------------------------")
    print("📡 [API REQUEST] Tìm Bus Đa Điểm!")
    try:
        data = request.get_json()
        waypoints = data.get('waypoints') # Mong đợi một mảng các điểm
        
        if not waypoints or not isinstance(waypoints, list):
            return jsonify({'success': False, 'error': 'Dữ liệu waypoints không hợp lệ'})

        print(f"📍 Nhận được {len(waypoints)} điểm dừng.")
        
        # Gọi hàm xử lý đa điểm
        result = plan_multi_stop_bus_trip(waypoints)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})

# ========== THÊM ENDPOINT MỚI ==========
@bus_bp.route('/validate-routes', methods=['GET'])
def validate_all_routes():
    """
    API kiểm tra tất cả tuyến trong database trên Supabase
    Dùng để debug/báo cáo chất lượng data
    """
    try:
        # 1️⃣ Lấy tất cả RouteId + StationDirection (DISTINCT)
        response = (
            supabase
            .table("stations")
            .select("RouteId, StationDirection")
            .order("RouteId", desc=False)
            .order("StationDirection", desc=False)
            .execute()
        )

        rows = response.data

        # Tạo danh sách unique (vì Supabase không có DISTINCT trực tiếp)
        seen = set()
        all_routes = []
        for r in rows:
            key = (r["RouteId"], r["StationDirection"])
            if key not in seen:
                seen.add(key)
                all_routes.append(key)

        valid = []
        invalid = []

        # 2️⃣ Lặp qua từng route/direction
        for route_id, direction in all_routes:

            # 🔥 Nếu validate_route_quality cần query DB → gửi route_id, direction là đủ
            is_valid, error = validate_route_quality(route_id, direction)

            # 3️⃣ Lấy tên route từ Supabase
            route_name = get_route_name(route_id)

            if is_valid:
                valid.append({
                    "route_id": route_id,
                    "route_name": route_name,
                    "direction": direction
                })
            else:
                invalid.append({
                    "route_id": route_id,
                    "route_name": route_name,
                    "direction": direction,
                    "error": error
                })

        total = len(all_routes)

        return jsonify({
            "success": True,
            "summary": {
                "total": total,
                "valid": len(valid),
                "invalid": len(invalid),
                "valid_percentage": round(len(valid) / total * 100, 1) if total > 0 else 0
            },
            "invalid_routes": invalid,
            "valid_routes": valid
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})