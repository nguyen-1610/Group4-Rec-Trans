from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os
import sys
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from astar import AStarRouter

# Khởi tạo router với đường dẫn tuyệt đối
DB_PATH = os.path.join(BASE_DIR, 'data', 'D:\PROJECT\rec_trans\Group4-Rec-Trans\GOpamine\backend\data\tourism-landmarks.db')

router = AStarRouter(db_path=DB_PATH)

app = Flask(
	__name__,
	template_folder=os.path.join(BASE_DIR, 'frontend', 'templates'),
	static_folder=os.path.join(BASE_DIR, 'frontend', 'static')
)

@app.route('/')
def index():
	return render_template('home.html')

@app.route('/register')
@app.route('/register/')
def register():
	return render_template('register.html')

@app.route('/login')
@app.route('/login/')
def login():
	return render_template('login.html')

@app.route('/astar')
def astar_demo():
	return render_template('astar.html')


@app.route('/api/places', methods=['GET'])
def get_places():
    """API lấy danh sách tất cả địa điểm"""
    try:
        places = router.get_all_places()
        return jsonify({
            'success': True,
            'data': places,
            'total': len(places)
        })
    except Exception as e:
        print(f"❌ Error in /api/places: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/find-route', methods=['POST'])
def find_route():
    """
    API tìm đường đi tối ưu
    
    Request Body:
    {
        "start_id": 1,
        "end_id": 5,
        "vehicle_speed": 30
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'start_id' not in data or 'end_id' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing start_id or end_id'
            }), 400
        
        start_id = int(data['start_id'])
        end_id = int(data['end_id'])
        
        print(f"📡 Nhận request: start={start_id}, end={end_id}")
        
        # Gọi hàm trong astar.py
        result = router.find_optimal_route(start_id, end_id)
        
        print(f"✅ Kết quả: {result['success']}")
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 404
    
    except Exception as e:
        print(f"❌ Error in /api/find-route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/test', methods=['GET'])
def test():
    """API test xem server có hoạt động không"""
    return jsonify({
        'success': True,
        'message': 'Server is running!',
        'db_path': DB_PATH
    })

# ========== ERROR HANDLERS ==========

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404


@app.errorhandler(500)
def internal_error(e):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

if __name__ == '__main__':
	app.run(debug=True)