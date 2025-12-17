"""
Main Flask Application
Sử dụng Supabase Auth cho authentication
"""

from flask import Flask, request, jsonify, render_template, redirect
from flask_cors import CORS
from flask_login import LoginManager
import os
import sys

# Thêm thư mục gốc project vào Python path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Thêm thư mục backend vào Python path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

# Import các blueprint từ thư mục routes
from backend.routes.feedback import feedback_bp, get_reviews_from_db
from backend.routes.astar import create_api_blueprint
from backend.routes.routing import form_bp
from backend.routes.bus_routes import bus_bp
from backend.routes.chatbot import chatbot_bp
from backend.routes.auth import auth_bp, setup_oauth  # Import setup_oauth từ auth mới
from backend.routes.transport_routes import transport_bp
from backend.routes.bus_manager import bus_data

# Import database và models
from database.supabase_client import supabase
from models.user_model import users

# ========== KHỞI TẠO FLASK APP ==========

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, '..', 'frontend', 'templates'),
    static_folder=os.path.join(BASE_DIR, '..', 'frontend', 'static')
)

# ========== CẤU HÌNH APP ==========

# Secret key cho session (ĐỔI THÀNH KEY PHỨC TẠP TRONG PRODUCTION!)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'your-secret-key-change-in-production')

# Redirect từ 127.0.0.1 sang localhost

# ========== CẤU HÌNH FLASK-LOGIN ==========

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'auth.login'  # Redirect đến trang login nếu chưa đăng nhập
login_manager.login_message = 'Vui lòng đăng nhập để truy cập trang này.'


@app.before_request
def init_cache():
    if not hasattr(app, 'cache_initialized'):
        bus_data.refresh_data()
        app.cache_initialized = True
    
@login_manager.user_loader
def load_user(user_id):
    """
    Callback để Flask-Login load user từ session
    Được gọi mỗi khi cần xác thực user từ session
    """
    try:
        # Query user từ Supabase
        result = supabase.table("users").select("*").eq("user_id", user_id).execute()
        
        if result.data and len(result.data) > 0:
            user_row = result.data[0]
            return users(
                user_id=user_row["user_id"],
                email=user_row["email"],
                username=user_row.get("username", "User"),
                auth_type=user_row.get("auth_type", "email"),
                is_guest=user_row.get("is_guest", False)
            )
    except Exception as e:
        print(f"❌ Error loading user: {e}")
    
    return None

# ========== CẤU HÌNH CORS ==========

CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# ========== SETUP OAUTH (CHỈ CẦN GỌI NẾU DÙNG AUTH CŨ) ==========
# Nếu dùng Supabase Auth mới thì hàm này không làm gì cả
setup_oauth(app)

# ========== ĐĂNG KÝ CÁC BLUEPRINT ==========

app.register_blueprint(auth_bp)          # Auth routes (/api/login, /api/register, etc.)
app.register_blueprint(feedback_bp)      # Feedback routes
app.register_blueprint(chatbot_bp)       # Chatbot routes
app.register_blueprint(form_bp)          # Form routes
app.register_blueprint(bus_bp)           # Bus routes
app.register_blueprint(transport_bp)     # Transport routes
app.register_blueprint(create_api_blueprint(None))  # A* routing API

# ========== ROUTES HTML ==========

@app.route('/')
def index():
    """Trang chủ - hiển thị 3 reviews mới nhất"""
    try:
        all_reviews = get_reviews_from_db()
        latest_reviews = all_reviews[:3] if all_reviews else []
    except Exception as e:
        print(f"❌ Error getting reviews: {e}")
        latest_reviews = []
    
    return render_template('home.html', reviews=latest_reviews)

@app.route('/register')
@app.route('/register/')
def register():
    """Trang đăng ký"""
    return render_template('register.html')

@app.route('/login')
@app.route('/login/')
def login():
    """Trang đăng nhập"""
    return render_template('login.html')

@app.route('/form')
@app.route('/form/')
def form():
    """Trang form tìm đường"""
    return render_template('form.html')

@app.route('/map_trans')
@app.route('/map_trans/')
def map_trans():
    """Trang bản đồ giao thông"""
    return render_template('map_trans.html')

@app.route('/chatbot')
@app.route('/chatbot/')
def chatbot():
    """Trang chatbot"""
    return render_template('chatbot.html')

# ========== HEALTH CHECK ==========

@app.route('/health')
def health_check():
    """Endpoint để kiểm tra server có hoạt động không"""
    return jsonify({
        'status': 'ok',
        'message': 'Server is running',
        'supabase_connected': True  # Có thể check connection thực tế nếu cần
    })

# ========== ERROR HANDLERS ==========

@app.errorhandler(404)
def not_found(e):
    """Xử lý lỗi 404 - Không tìm thấy trang"""
    if request.path.startswith('/api/'):
        # API endpoint không tồn tại
        return jsonify({
            'success': False,
            'error': 'Endpoint not found',
            'path': request.path
        }), 404
    else:
        # HTML page không tồn tại
        return render_template('404.html'), 404

@app.errorhandler(500)
def internal_error(e):
    """Xử lý lỗi 500 - Lỗi server"""
    print(f"❌ Internal error: {e}")
    
    if request.path.startswith('/api/'):
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500
    else:
        return render_template('500.html'), 500

@app.errorhandler(401)
def unauthorized(e):
    """Xử lý lỗi 401 - Chưa đăng nhập"""
    if request.path.startswith('/api/'):
        return jsonify({
            'success': False,
            'error': 'Unauthorized',
            'message': 'Please login to access this resource'
        }), 401
    else:
        return redirect('/login')

@app.errorhandler(403)
def forbidden(e):
    """Xử lý lỗi 403 - Không có quyền truy cập"""
    if request.path.startswith('/api/'):
        return jsonify({
            'success': False,
            'error': 'Forbidden',
            'message': 'You do not have permission to access this resource'
        }), 403
    else:
        return render_template('403.html'), 403

# ========== RUN APP ==========

if __name__ == '__main__':
    # Lấy cấu hình từ environment variables
    debug_mode = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    host = os.getenv('FLASK_HOST', 'localhost')
    port = int(os.getenv('FLASK_PORT', 5000))
    
    print(f"""
    ╔═══════════════════════════════════════╗
    ║  🚀 GOPamine Server Starting...       ║
    ╠═══════════════════════════════════════╣
    ║  🌐 Host: {host:<25}                  ║
    ║  🔌 Port: {port:<25}                  ║
    ║  🐛 Debug: {str(debug_mode):<24}      ║
    ║  🔒 Auth: Supabase Auth               ║
    ╚═══════════════════════════════════════╝
    """)
    
    app.run(
        debug=debug_mode,
        host=host,
        port=port
    )