import os
import sqlite3

# Thư mục của file database.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Thư mục chứa các file .db (đặt tên là "data")
DB_DIR = os.path.join(BASE_DIR, "..", "data")


class DBConnection:
    """Wrapper để mỗi database có hàm query riêng."""
    def __init__(self, filename):
        path = os.path.join(DB_DIR, filename)
        self.conn = sqlite3.connect(path)

    def query(self, sql, params=None):
        """Thực thi query và trả kết quả."""
        cur = self.conn.cursor()
        cur.execute(sql, params or [])
        self.conn.commit()
        return cur.fetchall()

    def execute(self, sql, params=None):
        """Thực thi query không cần trả kết quả (INSERT/UPDATE/DELETE)."""
        cur = self.conn.cursor()
        cur.execute(sql, params or [])
        self.conn.commit()


class DatabaseManager:
    """Quản lý tất cả database trong 1 class."""
    def __init__(self):
        self.busmap = DBConnection("busmap.db")
        self.users = DBConnection("users.db")
        self.trips = DBConnection("trips.db")
        self.analytics = DBConnection("analytics.db")
