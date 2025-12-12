from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os
import sys

# Lấy đường dẫn thư mục hiện tại (routes)
current_dir = os.path.dirname(os.path.abspath(__file__))
# Lấy đường dẫn thư mục cha (backend)
parent_dir = os.path.abspath(os.path.join(current_dir, '..'))
# Thêm thư mục cha vào đường dẫn tìm kiếm của Python
sys.path.insert(0, parent_dir)

from feedback import feedback_bp, get_reviews_from_db
from astar import create_api_blueprint
from routing import form_bp
from bus_routes import bus_bp
from backend.database.supabase_client import supabase
from backend.models.user_model import users

# 2. IMPORT TỪ CHATBOT.PY
from chatbot import chatbot_bp
from flask_login import LoginManager
from auth import auth_bp, User, get_db_connection, setup_oauth

from transport_routes import transport_bp

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'frontend', 'templates'),
    static_folder=os.path.join(BASE_DIR, 'frontend', 'static')
)

from flask import redirect, request # Đảm bảo đã import redirect và request ở đầu file
setup_oauth(app)

@app.before_request
def redirect_to_localhost():
    # Nếu truy cập bằng 127.0.0.1, chuyển ngay sang localhost
    if '127.0.0.1' in request.host:
        target_url = request.url.replace('127.0.0.1', 'localhost')
        return redirect(target_url, code=301)

app.secret_key = 'our_key'
# Cấu hình Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login' # Nếu chưa login thì đá về trang login

# Hàm load_user bắt buộc cho Flask-Login
@login_manager.user_loader
def load_user(user_id):
    # Supabase trả về list, nên phải lấy phần tử đầu tiên
    result = (
        supabase
        .table("users")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    rows = result.data

    if rows and len(rows) > 0:
        user_row = rows[0]
        return users(
            user_id=user_row["user_id"],
            email=user_row["email"],
            username=user_row["username"],
            auth_type=user_row["auth_type"],
            is_guest=user_row["is_guest"]
        )

    return None
# ---------------------

CORS(app)

# Cho phép frontend chạy trên domain/port khác gọi được API backend
CORS(app, resources={r"/api/*": {"origins": "*"}})

# 3. ĐĂNG KÝ BLUEPRINT
# Bước này giúp app nhận diện các đường dẫn '/feedback' và '/api/submit-review'
app.register_blueprint(feedback_bp)
app.register_blueprint(chatbot_bp)
app.register_blueprint(create_api_blueprint(None))
app.register_blueprint(form_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(bus_bp)
app.register_blueprint(transport_bp)

# ========== ROUTES HTML ==========
@app.route('/')
def index():
    all_reviews = get_all_reviews()
    latest_reviews = all_reviews[:3]
    return render_template('home.html', reviews=latest_reviews)

@app.route('/register')
@app.route('/register/')
def register():
    return render_template('register.html')

@app.route('/login')
@app.route('/login/')
def login():
    return render_template('login.html')

@app.route('/form')
@app.route('/form/')
def form():
	return render_template('form.html')


@app.route('/map_trans')
@app.route('/map_trans/')
def map_trans():
	return render_template('map_trans.html')


@app.route('/chatbot')
@app.route('/chatbot/')
def chatbot():
	return render_template('chatbot.html')

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