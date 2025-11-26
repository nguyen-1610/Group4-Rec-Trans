# File: backend/routes/transport_routes.py
from flask import Blueprint, request, jsonify
import sys
import os

# --- IMPORT MODULE ---
# Vì nằm cùng thư mục, import thẳng luôn, không cần dấu chấm (.)
try:
    import pricing_score
except ImportError:
    # Phòng hờ nếu chạy từ thư mục mẹ
    from . import pricing_score

transport_bp = Blueprint('transport_bp', __name__)

@transport_bp.route('/api/compare-transport', methods=['POST'])
def compare_transport():
    """API tính điểm và giá cho 4 loại phương tiện"""
    try:
        # Kiểm tra module logic
        if not pricing_score:
            return jsonify({
                'success': True, 
                'data': [],
                'message': 'Module logic chưa được load'
            })

        data = request.get_json()

        try:
            distance_km = float(data.get('distance_km', 0))
        except (ValueError, TypeError):
            distance_km = 0.0

        priorities = data.get('priorities', ['saving', 'speed'])
        
        print(f"📊 [Transport API] So sánh giá cho {distance_km}km, ưu tiên: {priorities}")

        # 1. Lấy context thời tiết
        weather_ctx = pricing_score.get_real_weather_context()
        
        # 2. Tạo context user
        user_req = pricing_score.UserRequest(is_student=False, priorities=priorities)

        # 3. Tính toán
        results = pricing_score.calculate_adaptive_scores(
            user_req, distance_km, weather_ctx, traffic_level=0.5
        )

        return jsonify({'success': True, 'data': results})

    except Exception as e:
        print(f"❌ Error in transport_bp: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500