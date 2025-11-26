from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os
import sys
from datetime import datetime

# --- THIẾT LẬP ĐƯỜNG DẪN ĐỂ IMPORT MODULE ---
# (Giúp app.py tìm thấy pricing_score.py ở thư mục routes bên cạnh)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
BACKEND_DIR = os.path.join(BASE_DIR, 'backend')
sys.path.append(BACKEND_DIR)
sys.path.append(os.path.join(BACKEND_DIR, 'routes'))

# Import module logic mới
try:
    import routes.pricing_score as pricing_score
    print("✅ Imported pricing_score successfully")
except ImportError as e:
    print(f"⚠️ Warning: Could not import pricing_score. {e}")
    pricing_score = None

# Import module logic cũ
from astar import AStarRouter

DB_PATH = os.path.join(BASE_DIR, 'data', 'tourism-landmarks.db')
router = AStarRouter(db_path=DB_PATH)

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'frontend', 'templates'),
    static_folder=os.path.join(BASE_DIR, 'frontend', 'static')
)
CORS(app)

# ====================================================
# CÁC ROUTE CŨ (GIỮ NGUYÊN KHÔNG ĐƯỢC XÓA)
# ====================================================

@app.route('/')
def index(): return render_template('home.html')

@app.route('/register')
def register(): return render_template('register.html')

@app.route('/login')
def login(): return render_template('login.html')

@app.route('/form')
def form(): return render_template('form.html')

@app.route('/map_trans')
def map_trans(): return render_template('map_trans.html')

@app.route('/chatbot')
def chatbot(): return render_template('chatbot.html')

@app.route('/api/places', methods=['GET'])
def get_places():
    try:
        places = router.get_all_places()
        return jsonify({'success': True, 'data': places, 'total': len(places)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/find-route', methods=['POST'])
def find_route():
    try:
        data = request.get_json()
        result = router.find_optimal_route(
            int(data['start_id']),
            int(data['end_id']),
            vehicle_type=data.get('vehicle_type', 'car'),
            vehicle_speed=float(data.get('vehicle_speed')) if data.get('vehicle_speed') else None
        )
        return jsonify(result) if result['success'] else (jsonify(result), 404)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ====================================================
# ROUTE MỚI (THÊM VÀO)
# ====================================================

@app.route('/api/compare-transport', methods=['POST'])
def compare_transport():
    """API tính điểm và giá cho 4 loại phương tiện"""
    try:
        if not pricing_score:
            return jsonify({'success': False, 'error': 'Pricing module not loaded'}), 500

        data = request.get_json()
        distance_km = float(data.get('distance_km', 0))
        priorities = data.get('priorities', ['saving', 'speed'])
        
        print(f"📊 So sánh giá cho {distance_km}km, ưu tiên: {priorities}")

        # 1. Tạo Context
        weather_ctx = pricing_score.WeatherContext(is_raining=False, is_hot=False)
        user_req = pricing_score.UserRequest(is_student=False, priorities=priorities)

        # 2. Tính toán
        results = pricing_score.calculate_adaptive_scores(
            user_req, distance_km, weather_ctx, traffic_level=0.5
        )

        # 3. Format kết quả trả về frontend
        formatted_results = []
        for r in results:
            formatted_results.append({
                "mode_name": r['mode_name'],
                "price_value": r.get('price_value', 0),
                "display_price": r.get('display_price', '0đ'),
                "duration": r.get('duration', 0),
                "score": r.get('score', 0),
                "labels": r.get('labels', [])
            })

        return jsonify({'success': True, 'data': formatted_results})

    except Exception as e:
        print(f"❌ Error compare-transport: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)