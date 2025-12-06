import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load biến môi trường từ file .env (DB_HOST, DB_PASSWORD...)
load_dotenv()

class PostgresConnection:
    """Wrapper kết nối PostgreSQL, thay thế cho DBConnection cũ."""
    
    def __init__(self):
        # Lấy cấu hình từ .env, nếu không có thì dùng giá trị mặc định
        self.host = os.getenv("DB_HOST", "localhost")
        self.database = os.getenv("DB_NAME", "gopamine")
        self.user = os.getenv("DB_USER", "postgres")
        self.password = os.getenv("DB_PASSWORD", "password")
        self.port = os.getenv("DB_PORT", "5432")

    def get_connection(self):
        """Tạo một kết nối mới đến PostgreSQL."""
        try:
            conn = psycopg2.connect(
                host=self.host,
                database=self.database,
                user=self.user,
                password=self.password,
                port=self.port
            )
            return conn
        except Exception as e:
            print(f"❌ Lỗi kết nối PostgreSQL: {e}")
            return None

    def query(self, sql, params=None):
        """
        Thực thi query SELECT và trả về kết quả.
        Tự động thay thế dấu '?' thành '%s' để tương thích với code cũ.
        """
        conn = self.get_connection()
        if not conn:
            return []
            
        try:
            # QUAN TRỌNG: SQLite dùng '?', Postgres dùng '%s'.
            # Dòng này giúp bạn không phải đi sửa từng file code cũ.
            sql = sql.replace('?', '%s')
            
            # RealDictCursor giúp trả về kết quả dạng Dictionary (Key-Value)
            # Ví dụ: {'user_id': 1, 'username': 'admin'} thay vì (1, 'admin')
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            cur.execute(sql, params or [])
            results = cur.fetchall()
            
            cur.close()
            conn.close()
            return results
            
        except Exception as e:
            print(f"❌ Lỗi Query SQL: {sql}\n   Chi tiết: {e}")
            if conn: conn.close()
            return []

    def execute(self, sql, params=None):
        """
        Thực thi query không trả về dữ liệu (INSERT/UPDATE/DELETE).
        """
        conn = self.get_connection()
        if not conn:
            return False
            
        try:
            sql = sql.replace('?', '%s') # Fix tương thích placeholder
            
            cur = conn.cursor()
            cur.execute(sql, params or [])
            conn.commit()
            
            cur.close()
            conn.close()
            return True
            
        except Exception as e:
            print(f"❌ Lỗi Execute SQL: {sql}\n   Chi tiết: {e}")
            conn.rollback() # Hoàn tác nếu lỗi
            if conn: conn.close()
            return False

class DatabaseManager:
    """
    Quản lý database. 
    Phiên bản mới: Tất cả 'busmap', 'user', 'vehicle' đều trỏ về 
    cùng 1 database PostgreSQL 'gopamine'.
    """
    def __init__(self):
        # Tạo đối tượng kết nối chung
        self.main_db = PostgresConnection()

        # Mapping để code cũ vẫn chạy bình thường mà không cần sửa logic
        # Ví dụ: gọi db.user.query() thực chất là gọi db.main_db.query()
        self.busmap = self.main_db
        self.user = self.main_db
        self.vehicle = self.main_db
        
        # Lưu ý: Nếu landmarks chưa chuyển qua Postgres thì bạn cần giữ class cũ cho nó.
        # Nếu đã chuyển rồi thì dùng dòng dưới:
        self.landmarks = self.main_db