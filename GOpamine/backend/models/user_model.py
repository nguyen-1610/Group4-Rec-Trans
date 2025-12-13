"""
User Model cho Flask-Login với Supabase
File này định nghĩa class User để Flask-Login có thể quản lý session
"""

from flask_login import UserMixin

class users(UserMixin):
    """
    User model để sử dụng với Flask-Login
    
    UserMixin cung cấp các method mặc định:
    - is_authenticated: True nếu user đã login
    - is_active: True nếu user active
    - is_anonymous: False (user không phải anonymous)
    - get_id(): Trả về user_id dưới dạng string
    """
    
    def __init__(self, user_id, email, username, auth_type='email', is_guest=False):
        """
        Khởi tạo User object
        
        Args:
            user_id (str): UUID của user từ Supabase
            email (str): Email của user
            username (str): Tên hiển thị
            auth_type (str): Loại auth ('email', 'google', 'facebook', 'guest')
            is_guest (bool): True nếu là tài khoản khách
        """
        self.id = str(user_id)  # Flask-Login yêu cầu thuộc tính 'id'
        self.user_id = str(user_id)  # Giữ lại cho code cũ
        self.email = email
        self.username = username
        self.auth_type = auth_type
        self.is_guest = is_guest
    
    def __repr__(self):
        """String representation của User"""
        return f"<User {self.username} ({self.email})>"
    
    def to_dict(self):
        """
        Convert User object thành dictionary
        Hữu ích khi trả về JSON response
        """
        return {
            'user_id': self.user_id,
            'email': self.email,
            'username': self.username,
            'auth_type': self.auth_type,
            'is_guest': self.is_guest
        }
    
    @property
    def is_authenticated(self):
        """Override nếu cần logic đặc biệt"""
        return True
    
    @property
    def is_active(self):
        """User luôn active trừ khi bị ban"""
        return True
    
    @property
    def is_anonymous(self):
        """User không phải anonymous (kể cả guest)"""
        return False
    
    def get_id(self):
        """
        Trả về unique identifier của user
        Flask-Login dùng hàm này để lưu user_id vào session
        """
        return str(self.user_id)


# Alias để tương thích với code cũ
User = users

__all__ = ['users', 'User']