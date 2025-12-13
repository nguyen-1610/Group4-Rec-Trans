"""
Auth Blueprint sử dụng Supabase Auth
Hỗ trợ: Email/Password, OAuth (Google, Facebook), Guest Login
"""

import os
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, redirect, url_for, session
from flask_login import login_user, logout_user, login_required, current_user, UserMixin
from dotenv import load_dotenv

# Import Supabase client
import sys
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.abspath(os.path.join(current_dir, '..'))
sys.path.insert(0, parent_dir)

from database.supabase_client import supabase

load_dotenv()

auth_bp = Blueprint('auth', __name__)

# ==============================================================================
# USER CLASS cho Flask-Login
# ==============================================================================
class User(UserMixin):
    def __init__(self, user_id, email, username, auth_type='email', is_guest=False):
        self.id = user_id  # Flask-Login yêu cầu thuộc tính này
        self.user_id = user_id
        self.email = email
        self.username = username
        self.auth_type = auth_type
        self.is_guest = is_guest

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

def get_or_create_user_profile(user_id):
    """Tạo hoặc lấy user profile từ Supabase"""
    try:
        # Kiểm tra profile có tồn tại chưa
        result = supabase.table("users").select("*").eq("user_id", user_id).execute()
        
        if result.data and len(result.data) > 0:
            return result.data[0]
        
        # Nếu chưa có, tạo profile mới
        profile_data = {
            "user_id": user_id,
            "username": "User",
            "auth_type": "email",
            "is_guest": False,
            "created_at": datetime.now().isoformat()
        }
        
        insert_result = supabase.table("users").upsert(profile_data).execute()
        return insert_result.data[0] if insert_result.data else None
        
    except Exception as e:
        print(f"❌ Error get_or_create_user_profile: {e}")
        return None

# ==============================================================================
# API 1: ĐĂNG KÝ (REGISTER) - Sử dụng Supabase Auth
# ==============================================================================
@auth_bp.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.json
        print(f"📝 [REGISTER REQ]: {data}")
        
        email = data.get('email')
        password = data.get('password')
        full_name = data.get('fullName')

        if not email or not password or not full_name:
            return jsonify({'success': False, 'message': 'Thiếu thông tin đăng ký'}), 400

        # Sử dụng Supabase Auth để đăng ký
        auth_response = supabase.auth.sign_up({
            "email": email,
            "password": password,
            "options": {
                "data": {
                    "full_name": full_name
                }
            }
        })

        if auth_response.user:
            user_id = auth_response.user.id
            
            # Tạo record trong bảng users
            user_data = {
                "user_id": user_id,
                "email": email,
                "username": full_name,
                "auth_type": "email",
                "is_guest": False,
                "created_at": datetime.now().isoformat()
            }
            
            supabase.table("users").upsert(user_data).execute()
            
            # Tạo UserProfile
            profile_data = {
                "user_id": user_id,
                "default_mode": 0,
                "age_group": "balanced"
            }
            # BỌC TRONG TRY-EXCEPT ĐỂ BỎ QUA LỖI 409
            try:
                # Cố gắng cập nhật (nếu chưa có thì tạo, có rồi thì update)
                supabase.table("users").upsert(user_data).execute()
                
                # Quan trọng: Thêm on_conflict='user_id' để tránh lỗi ở bảng Profile
                supabase.table("UserProfile").upsert(profile_data, on_conflict='user_id').execute()
                
            except Exception as db_error:
                # Nếu lỗi là trùng lặp (409) -> Coi như thành công (vì Trigger đã làm rồi)
                err_str = str(db_error)
                if "409" in err_str or "duplicate key" in err_str:
                    print(f"⚠️ [INFO] Data đã tồn tại (do Trigger), bỏ qua insert.")
                else:
                    # Nếu là lỗi khác thì vẫn in ra để debug
                    print(f"⚠️ [DB WARNING]: {err_str}")

            # --- KẾT THÚC SỬA ---
            
            print(f"✅ [REGISTER SUCCESS] ID: {user_id}")
            return jsonify({
                'success': True, 
                'message': 'Đăng ký thành công! Vui lòng kiểm tra email để xác nhận.',
                'user_id': user_id
            })
        else:
            return jsonify({'success': False, 'message': 'Lỗi khi đăng ký'}), 500

    except Exception as e:
        error_message = str(e)
        print(f"❌ [REGISTER ERROR]: {error_message}")
        
        # Xử lý các lỗi phổ biến
        if "User already registered" in error_message or "already exists" in error_message:
            return jsonify({'success': False, 'message': 'Email đã tồn tại'}), 409
        elif "Password should be at least 6 characters" in error_message:
            return jsonify({'success': False, 'message': 'Mật khẩu phải có ít nhất 6 ký tự'}), 400
        
        return jsonify({'success': False, 'message': f'Lỗi Server: {error_message}'}), 500

# ==============================================================================
# API 2: ĐĂNG NHẬP (LOGIN) - Sử dụng Supabase Auth
# ==============================================================================
@auth_bp.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        print(f"🔑 [LOGIN REQ]: {email}")

        if not email or not password:
            return jsonify({'success': False, 'message': 'Thiếu email hoặc mật khẩu'}), 400

        # Sử dụng Supabase Auth để đăng nhập
        auth_response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })

        if auth_response.user:
            user_id = auth_response.user.id
            
            # Lấy thông tin user từ database
            result = supabase.table("users").select("*").eq("user_id", user_id).execute()
            
            if result.data and len(result.data) > 0:
                user_data = result.data[0]
            else:
                # Nếu chưa có record, tạo mới
                user_data = {
                    "user_id": user_id,
                    "email": email,
                    "username": auth_response.user.user_metadata.get('full_name', 'User'),
                    "auth_type": "email",
                    "is_guest": False,
                    "created_at": datetime.now().isoformat()
                }
                # SỬA: Dùng upsert để nếu có rồi thì cập nhật, chưa có thì tạo mới -> Không bao giờ lỗi
                supabase.table("users").upsert(user_data).execute()
            
            # Tạo User object cho Flask-Login
            user_obj = User(
                user_id=user_data['user_id'],
                email=user_data['email'],
                username=user_data.get('username', 'User'),
                auth_type=user_data.get('auth_type', 'email'),
                is_guest=user_data.get('is_guest', False)
            )
            
            login_user(user_obj, remember=True)
            
            # Lưu session token
            session['supabase_token'] = auth_response.session.access_token
            
            return jsonify({
                'success': True, 
                'message': 'Đăng nhập thành công',
                'redirect_url': '/'
            })
        else:
            return jsonify({'success': False, 'message': 'Đăng nhập thất bại'}), 401

    except Exception as e:
        error_message = str(e)
        print(f"❌ [LOGIN ERROR]: {error_message}")
        
        if "Invalid login credentials" in error_message:
            return jsonify({'success': False, 'message': 'Email hoặc mật khẩu không đúng'}), 401
        
        return jsonify({'success': False, 'message': f'Lỗi: {error_message}'}), 500

# ==============================================================================
# API 3: KHÁCH (GUEST) - Tạo tài khoản guest tạm thời
# ==============================================================================
@auth_bp.route('/api/login-guest', methods=['POST'])
def login_guest():
    try:
        print("👤 [GUEST REQ]")
        
        guest_id = str(uuid.uuid4())
        guest_name = f"Guest_{guest_id[:6]}"
        guest_email = f"{guest_name.lower()}@guest.local"
        
        # Tạo guest user trong database
        user_data = {
            "user_id": guest_id,
            "email": guest_email,
            "username": guest_name,
            "auth_type": "guest",
            "is_guest": True,
            "created_at": datetime.now().isoformat()
        }
        
        supabase.table("users").upsert(user_data).execute()
        
        # Tạo UserProfile
        profile_data = {
            "user_id": guest_id,
            "age_group": "balanced"
        }
        # Chỉ định rõ: Nếu trùng 'user_id' thì update, đừng báo lỗi
        supabase.table("UserProfile").upsert(
            profile_data, 
            on_conflict="user_id" 
        ).execute()
        
        # Login guest
        user_obj = User(
            user_id=guest_id,
            email=guest_email,
            username=guest_name,
            auth_type='guest',
            is_guest=True
        )
        login_user(user_obj, remember=True)
        
        return jsonify({'success': True, 'redirect_url': '/'})

    except Exception as e:
        print(f"❌ [GUEST ERROR]: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# ==============================================================================
# API 4: ĐĂNG XUẤT (LOGOUT)
# ==============================================================================
@auth_bp.route('/api/logout', methods=['POST'])
@login_required
def logout():
    try:
        # Đăng xuất khỏi Supabase
        if 'supabase_token' in session:
            supabase.auth.sign_out()
            session.pop('supabase_token', None)
        
        # Đăng xuất khỏi Flask-Login
        logout_user()
        
        return jsonify({'success': True, 'message': 'Đăng xuất thành công'})
    except Exception as e:
        print(f"❌ [LOGOUT ERROR]: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# ==============================================================================
# API 5: LẤY THÔNG TIN USER HIỆN TẠI
# ==============================================================================
@auth_bp.route('/api/current-user', methods=['GET'])
def get_current_user():
    if current_user.is_authenticated:
        return jsonify({
            'is_logged_in': True,
            'user': {
                'id': current_user.user_id,
                'name': current_user.username,
                'email': current_user.email,
                'is_guest': current_user.is_guest
            }
        })
    return jsonify({'is_logged_in': False})

# ==============================================================================
# OAUTH - GOOGLE LOGIN
# ==============================================================================
@auth_bp.route('/api/login/google')
def login_google():
    """Chuyển hướng đến Google OAuth"""
    try:
        # Supabase sẽ tự động xử lý redirect
        redirect_url = f"{os.getenv('SUPABASE_URL')}/auth/v1/authorize?provider=google&redirect_to={request.host_url}"
        
        print(f"🔗 [GOOGLE LOGIN] Redirect to: {redirect_url}")
        return redirect(redirect_url)
        
    except Exception as e:
        print(f"❌ [GOOGLE LOGIN ERROR]: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# ==============================================================================
# OAUTH - FACEBOOK LOGIN
# ==============================================================================
@auth_bp.route('/api/login/facebook')
def login_facebook():
    """Chuyển hướng đến Facebook OAuth"""
    try:
        redirect_url = f"{os.getenv('SUPABASE_URL')}/auth/v1/authorize?provider=facebook&redirect_to={request.host_url}"
        
        print(f"🔗 [FACEBOOK LOGIN] Redirect to: {redirect_url}")
        return redirect(redirect_url)
        
    except Exception as e:
        print(f"❌ [FACEBOOK LOGIN ERROR]: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# ==============================================================================
# OAUTH CALLBACK - Xử lý sau khi OAuth thành công
# ==============================================================================
@auth_bp.route('/auth/callback')
def auth_callback():
    """
    Supabase sẽ redirect về đây sau khi OAuth thành công
    URL format: /auth/callback#access_token=...&refresh_token=...
    """
    try:
        # Supabase gửi token qua URL fragment (#), cần xử lý ở frontend
        # Hoặc có thể lấy từ query params nếu config đúng
        
        return redirect('/')  # Redirect về trang chủ, frontend sẽ xử lý token
        
    except Exception as e:
        print(f"❌ [AUTH CALLBACK ERROR]: {e}")
        return redirect('/?error=auth_failed')

# ==============================================================================
# HELPER - Không cần setup_oauth nữa vì dùng Supabase Auth
# ==============================================================================
def setup_oauth(app):
    """
    Hàm này giữ lại để tương thích với app.py
    Nhưng không cần làm gì vì Supabase Auth tự xử lý OAuth
    """
    print("✅ Supabase Auth initialized (OAuth ready)")
    pass