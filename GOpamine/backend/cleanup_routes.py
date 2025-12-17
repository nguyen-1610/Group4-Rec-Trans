# File: cleanup_routes.py
import sys
import os
# Hack path để import được backend
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database.supabase_client import supabase
from backend.utils.bus_routing import validate_route_quality, get_route_name

def scan_and_disable_bad_routes():
    print("🚀 Bắt đầu quét dọn database...")
    
    # 1. Lấy danh sách tất cả các RouteId và Direction
    # (Dùng set để lọc trùng)
    response = supabase.table("stations").select("RouteId, StationDirection").execute()
    unique_routes = set()
    for row in response.data:
        unique_routes.add((row['RouteId'], row['StationDirection']))
    
    print(f"📦 Tìm thấy {len(unique_routes)} tuyến cần kiểm tra.")
    
    bad_count = 0
    
    # 2. Duyệt qua từng tuyến
    for route_id, direction in unique_routes:
        is_valid, error_msg = validate_route_quality(route_id, direction)
        
        if not is_valid:
            bad_count += 1
            r_name = get_route_name(route_id)
            print(f"❌ PHÁT HIỆN LỖI: {r_name} (Dir: {direction}) -> {error_msg}")
            
            # 3. ĐÁNH DẤU LÀ HỎNG (Soft Delete)
            # Chỉ update bảng routes (hoặc tạo bảng status riêng nếu 1 route có 2 chiều mà 1 chiều hỏng)
            # Ở đây tui update bảng routes, nếu RouteId này hỏng thì coi như hỏng cả 2 chiều cho an toàn
            try:
                supabase.table("routes").update({"IsActive": 0}).eq("RouteId", route_id).execute()
                print("   -> Đã update IsActive = 0")
            except Exception as e:
                print(f"   -> Lỗi update DB: {e}")

    print("------------------------------------------------")
    print(f"✅ Hoàn tất! Đã vô hiệu hóa {bad_count} tuyến lỗi.")

if __name__ == "__main__":
    scan_and_disable_bad_routes()