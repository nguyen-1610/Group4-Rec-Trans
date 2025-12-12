import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, "../../"))

if project_root not in sys.path:
    sys.path.insert(0, project_root)

from backend.database.supabase_client import supabase

class DatabaseManager:
    """
    DatabaseManager phiên bản Supabase
    Giữ nguyên API db.busmap.query() để không lỗi code cũ.
    Nhưng bên trong dùng Supabase SDK.
    """

    def __init__(self):
        self.busmap = SupabaseWrapper()
        self.user = SupabaseWrapper()
        self.vehicle = SupabaseWrapper()
        self.landmarks = SupabaseWrapper()

class SupabaseWrapper:
    """Wrapper mô phỏng query() và execute() theo kiểu cũ."""

    def query(self, table_name, filters=None, select="*"):
        """
        Thay thế query SELECT.
        - table_name: tên bảng
        - filters: dict ví dụ {"RouteId": 12, "StationDirection": 1}
        """
        q = supabase.table(table_name).select(select)
        
        if filters:
            for key, value in filters.items():
                q = q.eq(key, value)

        result = q.execute()
        return result.data

    def insert(self, table_name, data):
        """INSERT dạng cũ."""
        result = supabase.table(table_name).insert(data).execute()
        return result.data

    def update(self, table_name, filters, new_values):
        """UPDATE dạng cũ."""
        q = supabase.table(table_name).update(new_values)
        for key, value in filters.items():
            q = q.eq(key, value)
        result = q.execute()
        return result.data

    def delete(self, table_name, filters):
        """DELETE dạng cũ."""
        q = supabase.table(table_name).delete()
        for key, value in filters.items():
            q = q.eq(key, value)
        result = q.execute()
        return result.data
