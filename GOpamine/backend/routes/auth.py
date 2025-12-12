import os
import uuid
import sys
from datetime import datetime
from flask import Blueprint, request, jsonify, make_response, url_for, session, current_app, redirect
from flask_login import login_user, logout_user, login_required, current_user, UserMixin
# Bổ sung các module cần thiết nếu chưa có
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
# 1. CẤU HÌNH ĐƯỜNG DẪN DB
# ==============================================================================
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.abspath(os.path.join(current_dir, '..'))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from utils.database import PostgresConnection

# Hàm này trả về Wrapper, không phải connection thô
def get_db_connection():
    return PostgresConnection()

# --- HÀM KIỂM TRA BẢNG ---
def check_table_exists():
    db = get_db_connection()
    try:
        # Dùng db.query thay vì cursor
        # to_regclass trả về tên bảng nếu tồn tại, hoặc None nếu không
        result = db.query("SELECT to_regclass('public.users') as table_name")
        if result and result[0]['table_name']:
            return True
        return False
    except Exception as e:
        print(f"❌ Lỗi kiểm tra bảng: {e}")
        return False

# --- CLASS USER ---
class User(UserMixin):
    def __init__(self, user_id, email, username, auth_type='local', is_guest=0):
        self.id = user_id # Flask-Login cần thuộc tính này
        self.user_id = user_id # Code của bạn đôi khi dùng cái này
        self.email = email
        self.username = username
        self.auth_type = auth_type
        self.is_guest = is_guest

# ==============================================================================
# API 1: ĐĂNG KÝ (REGISTER)
# ==============================================================================
@auth_bp.route('/api/register', methods=['POST'])
def register():
    if not check_table_exists():
        return jsonify({'success': False, 'message': 'Lỗi Server: Database chưa có bảng users'}), 500

    try:
        data = request.json
        print(f"📝 [REGISTER REQ]: {data}")
        
        email = data.get('email')
        password = data.get('password')
        full_name = data.get('fullName')

        if not email or not password or not full_name:
            return jsonify({'success': False, 'message': 'Thiếu thông tin đăng ký'}), 400

        db = get_db_connection()

        # 1. Kiểm tra email (Dùng db.query)
        # Lưu ý: db.query trả về list dictionary, nên chỉ cần check if list
        existing_user = db.query("SELECT 1 FROM users WHERE email = %s", (email,))
        if existing_user:
            return jsonify({'success': False, 'message': 'Email đã tồn tại'}), 409

        # 2. Thêm User (Dùng db.query để lấy RETURNING user_id)
        # Mẹo: INSERT có RETURNING thì dùng .query() để lấy kết quả trả về
        created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sql_insert_user = """
            INSERT INTO users (auth_type, username, email, is_guest, created_at, password)
            VALUES (%s, %s, %s, 0, %s, %s)
            RETURNING user_id
        """
        result = db.query(sql_insert_user, ('local', full_name, email, created_at, password))
        
        if not result:
            return jsonify({'success': False, 'message': 'Lỗi khi tạo user'}), 500
            
        new_user_id = result[0]['user_id']

        # 3. Thêm Profile (Dùng db.execute vì không cần trả về gì)
        # Lưu ý: "UserProfile" viết hoa cần để trong ngoặc kép
        db.execute("""
            INSERT INTO "UserProfile" (user_id, default_mode, age_group)
            VALUES (%s, 0, 'balanced')
        """, (new_user_id,))

        print(f"✅ [REGISTER SUCCESS] ID: {new_user_id}")
        return jsonify({'success': True, 'message': 'Đăng ký thành công'})

    except Exception as e:
        print(f"❌ [REGISTER ERROR]: {e}")
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

        db = get_db_connection()

        # Dùng db.query
        users = db.query("""
            SELECT user_id, username, email, auth_type, is_guest, password 
            FROM users WHERE email = %s
        """, (email,))

        if not users:
            return jsonify({'success': False, 'message': 'Email không đúng'}), 401
        
        user_row = users[0] # Lấy người đầu tiên tìm thấy

        # So sánh password
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
        db = get_db_connection()

        guest_name = f"Guest_{str(uuid.uuid4())[:6]}"
        guest_email = f"{guest_name.lower()}@guest.local"
        created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Dùng db.query để INSERT và lấy ID về
        sql_guest = """
            INSERT INTO users (auth_type, username, email, is_guest, created_at, password)
            VALUES ('guest', %s, %s, 1, %s, 'guest_pass')
            RETURNING user_id
        """
        result = db.query(sql_guest, (guest_name, guest_email, created_at))
        
        if not result:
             return jsonify({'success': False, 'message': 'Không thể tạo Guest'}), 500
             
        new_id = result[0]['user_id']
        
        # Insert Profile
        db.execute('INSERT INTO "UserProfile" (user_id, age_group) VALUES (%s, %s)', (new_id, 'balanced'))

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
                INSERT INTO UserProfile (user_id, default_mode, age_group)
                VALUES (?, 0, 'balanced')
            """, (final_user_id,))
            conn.commit()
        
        db_user = conn.execute("SELECT * FROM User WHERE user_id = ?", (final_user_id,)).fetchone()
        conn.close()

        # Đăng nhập Flask-Login
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