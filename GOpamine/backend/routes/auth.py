import sqlite3
import os
import uuid
import sys
from datetime import datetime
from flask import Blueprint, request, jsonify, make_response
from flask_login import login_user, logout_user, login_required, current_user, UserMixin
# Bổ sung các module cần thiết nếu chưa có
from flask import url_for, session, current_app, redirect
# [BỔ SUNG IMPORT CHO OAUTH]
from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv


auth_bp = Blueprint('auth', __name__)
load_dotenv()


# [SỬA/ĐẢM BẢO ĐOẠN NÀY NHƯ SAU]
oauth = OAuth() # Khởi tạo đối tượng OAuth tại đây

def setup_oauth(app):
    """Hàm này sẽ được app.py gọi để cài đặt OAuth"""
    oauth.init_app(app) # Gắn vào app Flask

    # 1. Đăng ký Google
    oauth.register(
        name='google',
        client_id=os.getenv('GOOGLE_CLIENT_ID'), # Đảm bảo tên biến ENV khớp với file .env của bạn
        client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile'}
    )

    # 2. Đăng ký Facebook
    oauth.register(
        name='facebook',
        client_id=os.getenv('FB_CLIENT_ID'),
        client_secret=os.getenv('FB_CLIENT_SECRET'),
        access_token_url='https://graph.facebook.com/oauth/access_token',
        access_token_params=None,
        authorize_url='https://www.facebook.com/dialog/oauth',
        authorize_params=None,
        api_base_url='https://graph.facebook.com/',
        client_kwargs={'scope': 'email public_profile'}
    )

# ==============================================================================
# 1. CẤU HÌNH ĐƯỜNG DẪN DB (CHÍNH XÁC TUYỆT ĐỐI)
# ==============================================================================

# Lấy đường dẫn tuyệt đối của file auth.py
CURRENT_FILE_PATH = os.path.abspath(__file__)
# Lùi ra thư mục routes -> backend -> GOpamine
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(CURRENT_FILE_PATH)))
# Trỏ vào data/user.db
DB_PATH = os.path.join(PROJECT_ROOT, 'data', 'user.db')

def get_db_connection():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    except Exception as e:
        print(f"❌ Lỗi kết nối SQLite: {e}")
        return None

# --- HÀM KIỂM TRA BẢNG (Chạy mỗi khi gọi API) ---
def check_table_exists():
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='User';")
        if cursor.fetchone():
            conn.close()
            return True
        else:
            print("❌ [CRITICAL] Bảng 'User' chưa được tạo trong user.db!")
            conn.close()
            return False
    except Exception as e:
        print(f"❌ Lỗi kiểm tra bảng: {e}")
        return False

# --- XỬ LÝ CORS ---
@auth_bp.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    return response

@auth_bp.route('/api/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    return jsonify({'status': 'ok'})

# --- CLASS USER ---
class User(UserMixin):
    def __init__(self, user_id, email, username, auth_type='local', is_guest=0):
        self.id = user_id
        self.email = email
        self.username = username
        self.auth_type = auth_type
        self.is_guest = is_guest

# ==============================================================================
# API 1: ĐĂNG KÝ (REGISTER)
# ==============================================================================
@auth_bp.route('/api/register', methods=['POST'])
def register():
    # 1. Kiểm tra DB trước
    if not check_table_exists():
        return jsonify({'success': False, 'message': 'Lỗi Server: Database chưa có bảng User'}), 500

    try:
        data = request.json
        print(f"📝 [REGISTER REQ]: {data}")
        
        email = data.get('email')
        password = data.get('password')
        full_name = data.get('fullName')

        if not email or not password or not full_name:
            return jsonify({'success': False, 'message': 'Thiếu thông tin đăng ký'}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # 2. Kiểm tra email
        cursor.execute("SELECT 1 FROM User WHERE email = ?", (email,))
        if cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'message': 'Email đã tồn tại'}), 409

        # 3. Thêm User
        created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            INSERT INTO User (auth_type, username, email, is_guest, created_at, password)
            VALUES (?, ?, ?, 0, ?, ?)
        """, ('local', full_name, email, created_at, password))
        
        new_user_id = cursor.lastrowid

        # 4. Thêm Profile
        cursor.execute("""
            INSERT INTO UserProfile (user_id, default_mode, age_group)
            VALUES (?, 0, 'balanced')
        """, (new_user_id,))

        conn.commit()
        conn.close()
        
        print(f"✅ [REGISTER SUCCESS] ID: {new_user_id}")
        return jsonify({'success': True, 'message': 'Đăng ký thành công'})

    except Exception as e:
        print(f"❌ [REGISTER ERROR]: {e}")
        import traceback
        traceback.print_exc() # In toàn bộ lỗi ra Terminal
        return jsonify({'success': False, 'message': f'Lỗi Server: {str(e)}'}), 500

# ==============================================================================
# API 2: ĐĂNG NHẬP (LOGIN)
# ==============================================================================
@auth_bp.route('/api/login', methods=['POST'])
def login():
    if not check_table_exists():
        return jsonify({'success': False, 'message': 'Lỗi Server: Database hỏng'}), 500

    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        print(f"🔑 [LOGIN REQ]: {email}")

        conn = get_db_connection()
        cursor = conn.cursor()

        user_row = cursor.execute("""
            SELECT user_id, username, email, auth_type, is_guest, password 
            FROM User WHERE email = ?
        """, (email,)).fetchone()
        conn.close()

        if not user_row:
            return jsonify({'success': False, 'message': 'Email không đúng'}), 401

        # So sánh chuỗi (Plain text)
        if str(user_row['password']) != str(password):
            return jsonify({'success': False, 'message': 'Sai mật khẩu'}), 401

        user_obj = User(
            user_id=user_row['user_id'], 
            email=user_row['email'], 
            username=user_row['username'],
            auth_type=user_row['auth_type'],
            is_guest=user_row['is_guest']
        )
        login_user(user_obj, remember=True)

        return jsonify({'success': True, 'message': 'Thành công', 'redirect_url': '/'})

    except Exception as e:
        print(f"❌ [LOGIN ERROR]: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# ==============================================================================
# API 3: KHÁCH (GUEST)
# ==============================================================================
@auth_bp.route('/api/login-guest', methods=['POST'])
def login_guest():
    if not check_table_exists():
        return jsonify({'success': False, 'message': 'Lỗi Server: Database hỏng'}), 500

    try:
        print("👤 [GUEST REQ]")
        conn = get_db_connection()
        cursor = conn.cursor()

        guest_name = f"Guest_{str(uuid.uuid4())[:6]}"
        guest_email = f"{guest_name.lower()}@guest.local"
        created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        cursor.execute("""
            INSERT INTO User (auth_type, username, email, is_guest, created_at, password)
            VALUES ('guest', ?, ?, 1, ?, 'guest_pass')
        """, (guest_name, guest_email, created_at))
        
        new_id = cursor.lastrowid
        cursor.execute("INSERT INTO UserProfile (user_id, age_group) VALUES (?, 'balanced')", (new_id,))
        conn.commit()
        conn.close()

        user_obj = User(user_id=new_id, email=guest_email, username=guest_name, auth_type='guest', is_guest=1)
        login_user(user_obj, remember=True)

        return jsonify({'success': True, 'redirect_url': '/'})

    except Exception as e:
        print(f"❌ [GUEST ERROR]: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# ... (Giữ nguyên logout/current-user) ...
@auth_bp.route('/api/current-user', methods=['GET'])
def get_current_user():
    if current_user.is_authenticated:
        return jsonify({'is_logged_in': True, 'user': {'name': current_user.username}})
    return jsonify({'is_logged_in': False})

@auth_bp.route('/api/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'success': True})

# ==============================================================================
# [BỔ SUNG] XỬ LÝ OAUTH2 THỰC TẾ (REAL IMPLEMENTATION)
# Thay thế cho quy trình giả lập cũ.
# Yêu cầu: Phải cấu hình oauth.register() bên app.py trước.
# ==============================================================================

# --- 1. Route Chuyển hướng người dùng sang Google/Facebook ---
@auth_bp.route('/api/login/<provider>')
def login_oauth(provider):
    try:
        redirect_uri = url_for('auth.auth_callback', provider=provider, _external=True)
        
        print(f">>> [OAUTH REAL] Chuyển hướng sang {provider}... URI: {redirect_uri}")
        return oauth.create_client(provider).authorize_redirect(redirect_uri)
    except Exception as e:
        print(f"❌ [OAUTH INIT ERROR]: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# --- 2. Route Callback (Nơi nhận kết quả trả về từ Google/FB) ---
@auth_bp.route('/api/auth/<provider>/callback')
def auth_callback(provider):
    try:
        # Trao đổi code lấy token
        token = oauth.create_client(provider).authorize_access_token()
        
        user_info = None
        social_id = None
        email = None
        name = None

        # Lấy thông tin user tùy theo nhà cung cấp
        if provider == 'google':
            user_info = token.get('userinfo')
            # Google trả về: sub (id), email, name
            social_id = user_info.get('sub')
            email = user_info.get('email')
            name = user_info.get('name')
            
        elif provider == 'facebook':
            # Facebook cần gọi thêm API để lấy info
            # Token đã tự động được lưu trong session của client
            resp = oauth.create_client('facebook').get('me?fields=id,name,email')
            user_info = resp.json()
            social_id = user_info.get('id')
            email = user_info.get('email')
            name = user_info.get('name')

        print(f">>> [OAUTH REAL SUCCESS] {provider} | Email: {email}")

        if not email:
            return jsonify({'success': False, 'message': 'Không lấy được Email từ mạng xã hội. Vui lòng thử lại.'}), 400

        # --- TÁI SỬ DỤNG LOGIC DB (CREATE OR LOGIN) ---
        conn = get_db_connection()
        cursor = conn.cursor()

        # Kiểm tra user tồn tại
        user_row = cursor.execute("SELECT * FROM User WHERE email = ?", (email,)).fetchone()
        
        final_user_id = None

        if user_row:
            final_user_id = user_row['user_id']
            # Cập nhật social_id và auth_type mới nhất
            cursor.execute("UPDATE User SET social_id = ?, auth_type = ? WHERE user_id = ?", 
                         (social_id, provider, final_user_id))
            conn.commit()
        else:
            # Tạo user mới
            print(f">>> [OAUTH REAL] Tạo User mới cho {email}")
            created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            dummy_pass = f"{provider}_{str(uuid.uuid4())[:8]}"
            
            cursor.execute("""
                INSERT INTO User (auth_type, username, email, social_id, is_guest, created_at, password)
                VALUES (?, ?, ?, ?, 0, ?, ?)
            """, (provider, name, email, social_id, created_at, dummy_pass))
            
            final_user_id = cursor.lastrowid
            
            # Tạo Profile mặc định (Quan trọng để không lỗi app)
            cursor.execute("""
                INSERT INTO UserProfile (user_id, default_budget, priority)
                VALUES (?, 0, 'balanced')
            """, (final_user_id,))
            conn.commit()
        
        conn.close()

        # Đăng nhập Flask-Login
        conn2 = get_db_connection()
        db_user = conn2.execute("SELECT * FROM User WHERE user_id = ?", (final_user_id,)).fetchone()
        conn2.close()

        user_obj = User(
            user_id=db_user['user_id'], 
            email=db_user['email'], 
            username=db_user['username'],
            auth_type=db_user['auth_type'],
            is_guest=db_user['is_guest']
        )
        login_user(user_obj, remember=True)

        # Chuyển hướng về trang chủ
        return redirect('/')

    except Exception as e:
        print(f"❌ [OAUTH CALLBACK ERROR]: {e}")
        return jsonify({'success': False, 'message': f'Lỗi đăng nhập {provider}: {str(e)}'}), 500