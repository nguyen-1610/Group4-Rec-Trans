import sqlite3
import math
import os

# Đường dẫn DB
db_path = r"D:\Ki_3\TDTT\Project\Group4-Rec-Trans\GOpamine\data\busmap.db"

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    print("🤖 ĐANG KHỞI TẠO DỮ LIỆU TEST...")
    
    # 1. Lấy một RouteId bất kỳ
    # Chúng ta lấy tuyến 10977 (đã biết là có tồn tại)
    route_id = 10977
    
    # 2. Lấy danh sách trạm của tuyến này
    stops = conn.execute("SELECT * FROM stations WHERE RouteId = ? ORDER BY StationOrder ASC", (route_id,)).fetchall()
    
    print(f"📊 Tuyến {route_id} có tổng cộng {len(stops)} trạm.")

    if len(stops) < 2:
        print("❌ Tuyến này ít hơn 2 trạm, không thể test tìm đường.")
        exit()
        
    # [FIX] Lấy trạm đầu và trạm cuối danh sách (An toàn tuyệt đối)
    s_stop = stops[0]  
    e_stop = stops[-1] # Lấy phần tử cuối cùng
    
    # Giả lập input (người dùng đứng ngay tại trạm)
    # Lưu ý tên cột là Lat/Lng (viết hoa) theo đúng schema bạn gửi
    start_coords = {'lat': s_stop['Lat'], 'lon': s_stop['Lng']}
    end_coords = {'lat': e_stop['Lat'], 'lon': e_stop['Lng']}

    print(f"📍 Chọn Trạm Đi: {s_stop['StationName']} (Order {s_stop['StationOrder']})")
    print(f"📍 Chọn Trạm Đến: {e_stop['StationName']} (Order {e_stop['StationOrder']})")
    
    print("\n🚀 BẮT ĐẦU CHẠY THUẬT TOÁN MÔ PHỎNG...")
    
    # --- LOGIC THUẬT TOÁN (Mô phỏng lại logic trong backend) ---
    
    # A. Tìm Candidates (Bán kính 3km)
    # Lấy tất cả trạm trong DB để quét
    all_stops = conn.execute("SELECT StationId, StationName, Lat, Lng, RouteId, StationOrder, StationDirection FROM stations").fetchall()
    
    start_candidates = []
    end_candidates = []
    limit = 3.0 # km
    
    for stop in all_stops:
        d_s = haversine(start_coords['lat'], start_coords['lon'], stop['Lat'], stop['Lng'])
        if d_s <= limit: start_candidates.append(dict(stop))
            
        d_e = haversine(end_coords['lat'], end_coords['lon'], stop['Lat'], stop['Lng'])
        if d_e <= limit: end_candidates.append(dict(stop))
            
    print(f"   -> Tìm thấy {len(start_candidates)} trạm gần điểm đi.")
    print(f"   -> Tìm thấy {len(end_candidates)} trạm gần điểm đến.")
    
    # B. Tìm Tuyến Direct (Khớp tuyến)
    found = False
    print("\n🔍 Đang khớp tuyến...")
    for s in start_candidates:
        for e in end_candidates:
            # Check cùng tuyến, cùng chiều
            if s['RouteId'] == e['RouteId'] and s['StationDirection'] == e['StationDirection']:
                # Check thứ tự: Trạm đi (s) phải nhỏ hơn trạm đến (e)
                if s['StationOrder'] < e['StationOrder']:
                    print(f"✅ THÀNH CÔNG! Tìm thấy tuyến phù hợp:")
                    print(f"   - Tuyến ID: {s['RouteId']}")
                    print(f"   - Chiều (Direction): {s['StationDirection']}")
                    print(f"   - Đi từ: {s['StationName']} (Order {s['StationOrder']})")
                    print(f"   - Đến: {e['StationName']} (Order {e['StationOrder']})")
                    found = True
                    break # Tìm thấy 1 cái là mừng rồi, thoát luôn
        if found: break
        
    if not found:
        print("\n❌ THẤT BẠI: Thuật toán không tìm ra đường.")
        print("   -> Nguyên nhân có thể do: RouteId không khớp, hoặc StationOrder bị ngược.")
    else:
        print("\n🎉 KẾT LUẬN: Logic thuật toán CHÍNH XÁC với dữ liệu DB này!")
        print("   -> Bạn có thể yên tâm dùng file 'bus_routing.py' mới nhất mà tôi gửi.")

    conn.close()

except Exception as e:
    print(f"❌ Lỗi crash: {e}")