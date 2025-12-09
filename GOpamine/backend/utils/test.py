import sqlite3
import os

def get_db():
    # ... (Giữ nguyên logic tìm đường dẫn cũ của bạn) ...
    current_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.abspath(os.path.join(current_dir, '../../data/busmap.db'))
    if not os.path.exists(db_path):
        fallback = os.path.abspath(os.path.join(current_dir, '../data/busmap.db'))
        if os.path.exists(fallback): return sqlite3.connect(fallback)
    return sqlite3.connect(db_path)

conn = get_db()
print(f"📂 Đang kiểm tra file: {get_db().cursor().execute('PRAGMA database_list').fetchall()[0][2]}")
print("=" * 60)

# 1. Thống kê tổng quan
total_routes = conn.execute("SELECT COUNT(*) FROM routes").fetchone()[0]
total_stations = conn.execute("SELECT COUNT(*) FROM stations").fetchone()[0]
print(f"📊 TỔNG QUAN: {total_routes} Tuyến | {total_stations} Trạm")

# 2. Tìm các tuyến "CHẾT" (Ít hơn 5 trạm)
print("-" * 60)
print("💀 DANH SÁCH CÁC TUYẾN BỊ HỎNG (Dưới 10 trạm):")
bad_routes = conn.execute("""
    SELECT r.RouteNo, r.RouteName, COUNT(s.StationId) as StopCount
    FROM routes r
    LEFT JOIN stations s ON r.RouteId = s.RouteId
    GROUP BY r.RouteId
    HAVING StopCount < 10
    ORDER BY StopCount ASC
""").fetchall()

if bad_routes:
    print(f"⚠️ Phát hiện {len(bad_routes)} tuyến bị lỗi dữ liệu!")
    for r in bad_routes:	
        print(f"   - Xe {r[0]}: {r[2]} trạm ({r[1]})")
   
else:
    print("✅ Không có tuyến nào bị hỏng (tất cả đều > 5 trạm).")

print("=" * 60)
conn.close()