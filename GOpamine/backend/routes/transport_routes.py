# File: backend/routes/transport_routes.py
from flask import Blueprint, request, jsonify
import sys
import os

# 1. Import logic tính giá (như cũ)
try:
    import pricing_score
except ImportError:
    from . import pricing_score

# 2. [QUAN TRỌNG] Import bộ não tìm đường AStarRouter
try:
    from .astar import AStarRouter
except ImportError:
    # Fallback nếu import lỗi
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from astar import AStarRouter

transport_bp = Blueprint('transport_bp', __name__)

# Khởi tạo Router (Bộ não tìm đường)
# Lưu ý: Router này đã bao gồm logic tìm Bus, Grab, Be...
ROUTER = AStarRouter()

# ==============================================================================
# API 1: TÍNH TOÁN LỘ TRÌNH ĐA ĐIỂM (Frontend Map gọi cái này!)
# ==============================================================================
@transport_bp.route('/api/plan-trip', methods=['POST'])
def plan_trip():
    """
    Nhận: { 
        "start": {lat, lon, name}, 
        "destinations": [{lat, lon, name}, ...],
        "is_student": true/false 
    }
    Trả về: Lộ trình chi tiết + Giá tiền các hãng
    """
    try:
        data = request.get_json()
        print("📍 [API] Nhận yêu cầu tìm đường đa điểm:", data)

        # Lấy dữ liệu từ Frontend gửi lên
        # Frontend có thể gửi key là 'start' (object) hoặc 'start_id' (tên)
        start_input = data.get('start') or data.get('start_id')
        dest_inputs = data.get('destinations') or data.get('stops', [])
        is_student = data.get('is_student', False)

        if not start_input or not dest_inputs:
            return jsonify({'success': False, 'error': 'Thiếu điểm đi hoặc điểm đến'})

        # Gọi AStarRouter để tính toán (Logic nằm bên file astar.py)
        result = ROUTER.plan_multi_stop_trip(
            start_id=start_input,
            destination_ids=dest_inputs,
            is_student=is_student,
            vehicle_type='car' # Mặc định dùng 4 bánh để tìm đường chính
        )

        return jsonify(result)

    except Exception as e:
        print(f"❌ [API Error] Plan Trip Failed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# ==============================================================================
# API 2: SO SÁNH GIÁ NHANH (Giữ lại để tương thích logic cũ)
# ==============================================================================
@transport_bp.route('/api/compare-transport', methods=['POST'])
def compare_transport():
    """API tính điểm adaptive (dùng cho Chatbot hoặc so sánh nhanh)"""
    try:
        data = request.get_json()
        distance_km = float(data.get('distance_km', 0))
        priorities = data.get('priorities', ['saving', 'speed'])
        
        # Lấy weather real-time
        weather_ctx = pricing_score.get_real_weather_context()
        user_req = pricing_score.UserRequest(is_student=False, priorities=priorities)

        # Tính toán điểm số
        results = pricing_score.calculate_adaptive_scores(
            user_req, distance_km, weather_ctx, traffic_level=0.5
        )

        return jsonify({'success': True, 'data': results})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500