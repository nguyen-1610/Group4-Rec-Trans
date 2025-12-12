import os
from supabase import create_client

# ============================================================
# 1. KẾT NỐI SUPABASE
# ============================================================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("❌ Thiếu SUPABASE_URL hoặc SUPABASE_KEY trong environment!")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("🔗 Đã kết nối Supabase!")
print("=" * 60)

# ============================================================
# 2. THỐNG KÊ TỔNG QUAN (Routes, Stations)
# ============================================================

# Đếm tổng tuyến
resp_routes = supabase.table("routes").select("RouteId", count="exact").execute()
total_routes = resp_routes.count or 0

# Đếm tổng trạm
resp_stations = supabase.table("stations").select("StationId", count="exact").execute()
total_stations = resp_stations.count or 0

print(f"📊 TỔNG QUAN: {total_routes} Tuyến | {total_stations} Trạm")
print("=" * 60)

# ============================================================
# 3. TÌM TUYẾN BỊ HỎNG (Có < 13 trạm)
# ============================================================

print("💀 DANH SÁCH CÁC TUYẾN BỊ HỎNG (Dưới 13 trạm):")

# Lấy toàn bộ tuyến
routes = supabase.table("routes").select("RouteId, RouteNo, RouteName").execute().data

bad_routes = []

for r in routes:
    route_id = r["RouteId"]

    # Đếm số trạm của tuyến
    resp = (
        supabase.table("stations")
        .select("StationId", count="exact")
        .eq("RouteId", route_id)
        .execute()
    )

    stop_count = resp.count or 0

    # Lưu tuyến bị lỗi
    if stop_count < 13:
        bad_routes.append({
            "RouteNo": r["RouteNo"],
            "RouteName": r["RouteName"],
            "StopCount": stop_count
        })

# ============================================================
# 4. IN KẾT QUẢ
# ============================================================

if bad_routes:
    print(f"⚠️ Phát hiện {len(bad_routes)} tuyến bị lỗi dữ liệu!")

    # Sort tăng dần theo số lượng trạm
    bad_routes.sort(key=lambda x: x["StopCount"])

    for r in bad_routes:
        print(f"   - Xe {r['RouteNo']}: {r['StopCount']} trạm ({r['RouteName']})")
else:
    print("✅ Không có tuyến nào bị hỏng (tất cả đều >= 13 trạm).")

print("=" * 60)
print("🏁 Hoàn tất kiểm tra dữ liệu!")
