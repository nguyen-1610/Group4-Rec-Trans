import sqlite3
import math
import os
import sys

# =========================================================
# 1. HÀM TÌM ĐƯỜNG DẪN DB (Đã được kiểm chứng)
# =========================================================
def get_db_path():
    # Lấy đường dẫn file này: backend/utils/bus_routing.py
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Logic tìm file: Đi ngược lên 2 cấp (utils -> backend -> GOpamine -> data)
    db_path = os.path.abspath(os.path.join(current_dir, '../../data/busmap.db'))
    
    # Kiểm tra lần cuối
    if not os.path.exists(db_path):
        # Fallback cho trường hợp cấu trúc lạ
        fallback = os.path.abspath(os.path.join(current_dir, '../data/busmap.db'))
        if os.path.exists(fallback): return fallback
        print(f"❌ [CRITICAL] Không tìm thấy DB tại: {db_path}")
        return None
        
    return db_path

def get_db():
    db_path = get_db_path()
    if not db_path: raise FileNotFoundError("Server không tìm thấy file busmap.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

# =========================================================
# 2. LOGIC TÌM ĐƯỜNG (Logic chiến thắng từ file test.py)
# =========================================================

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def get_route_info(conn, route_id):
    try:
        return conn.execute("SELECT RouteName, RouteNo, OutBoundDescription, InBoundDescription FROM route_info WHERE RouteId = ?", (route_id,)).fetchone()
    except:
        return None

def get_path_for_route(conn, route_id, direction, start_order, end_order):
    # Lấy tọa độ các trạm nằm giữa điểm đi và điểm đến để vẽ đường
    query = """
        SELECT Lat, Lng 
        FROM stations 
        WHERE RouteId = ? AND StationDirection = ? 
          AND StationOrder >= ? AND StationOrder <= ? 
        ORDER BY StationOrder ASC
    """
    rows = conn.execute(query, (route_id, direction, start_order, end_order)).fetchall()
    return [[r['Lat'], r['Lng']] for r in rows]

def find_smart_bus_route(start_coords, end_coords):
    print(f"\n🔍 [WEB REQUEST] Tìm từ {start_coords} đến {end_coords}")
    conn = get_db()
    
    # 1. Lấy tất cả trạm
    try:
        all_stops = conn.execute("SELECT StationId, StationName, Lat, Lng, RouteId, StationOrder, StationDirection FROM stations").fetchall()
    except Exception as e:
        return {'success': False, 'error': f"Lỗi đọc DB: {str(e)}"}

    # 2. Lọc ứng viên (Bán kính 3km - như test)
    limit_dist = 3.0 
    start_candidates = []
    end_candidates = []

    for stop in all_stops:
        d_s = haversine(start_coords['lat'], start_coords['lon'], stop['Lat'], stop['Lng'])
        if d_s <= limit_dist:
            s = dict(stop)
            s['dist'] = d_s
            start_candidates.append(s)

        d_e = haversine(end_coords['lat'], end_coords['lon'], stop['Lat'], stop['Lng'])
        if d_e <= limit_dist:
            e = dict(stop)
            e['dist'] = d_e
            end_candidates.append(e)

    if not start_candidates or not end_candidates:
        return {'success': False, 'error': f'Không có trạm xe buýt nào gần bạn (3km).'}

    # 3. Khớp tuyến (Logic Match)
    best_direct = None
    min_walk = float('inf')

    for s in start_candidates:
        for e in end_candidates:
            # Điều kiện vàng: Cùng tuyến, Cùng chiều
            if s['RouteId'] == e['RouteId'] and s['StationDirection'] == e['StationDirection']:
                # Điều kiện vàng: Trạm đón đứng trước trạm xuống
                if s['StationOrder'] < e['StationOrder']:
                    total_walk = s['dist'] + e['dist']
                    if total_walk < min_walk:
                        min_walk = total_walk
                        best_direct = (s, e)

    if best_direct:
        s_stop, e_stop = best_direct
        print(f"   ✅ Tìm thấy tuyến ID: {s_stop['RouteId']}")
        
        # Lấy thông tin
        r_info = get_route_info(conn, s_stop['RouteId'])
        
        route_no = "Bus"
        route_name = "Tuyến xe buýt"
        desc = "Lộ trình đi thẳng"
        
        if r_info:
            route_no = r_info['RouteNo'] if r_info['RouteNo'] else "Bus"
            route_name = r_info['RouteName'] if r_info['RouteName'] else "Unknown"
            raw_desc = r_info['OutBoundDescription'] if s_stop['StationDirection'] == 0 else r_info['InBoundDescription']
            if raw_desc: desc = raw_desc

        # Lấy đường vẽ
        path = get_path_for_route(conn, s_stop['RouteId'], s_stop['StationDirection'], s_stop['StationOrder'], e_stop['StationOrder'])
        
        conn.close()
        return {
            'success': True,
            'type': 'direct',
            'data': {
                'route_name': f"{route_no} - {route_name}",
                'description': desc,
                'walk_to_start': [s_stop['Lat'], s_stop['Lng']],
                'walk_from_end': [e_stop['Lat'], e_stop['Lng']],
                'segments': [{'type': 'bus', 'path': path, 'name': route_no, 'color': '#FF9800'}],
                'start_stop': s_stop['StationName'],
                'end_stop': e_stop['StationName']
            }
        }
    conn.close()
    return {
        'success': False, 
        'error': 'Không tìm thấy tuyến đi thẳng phù hợp giữa 2 điểm này.'
    }

# Tìm đa điểm
def plan_multi_stop_bus_trip(waypoints):
    """
    Input: Danh sách các điểm [{'lat':..., 'lon':...}, ...] theo thứ tự đã tối ưu
    Output: Tổng hợp lộ trình từng chặng
    """
    if not waypoints or len(waypoints) < 2:
        return {'success': False, 'error': 'Cần ít nhất 2 điểm để tìm đường.'}

    total_segments = []
    
    # Lặp qua từng cặp điểm: (0->1), (1->2), (2->3)...
    for i in range(len(waypoints) - 1):
        start_node = waypoints[i]
        end_node = waypoints[i+1]
        
        # Chuẩn hóa key (đề phòng lúc thì 'lng', lúc thì 'lon')
        s_coords = {'lat': float(start_node['lat']), 'lon': float(start_node.get('lon', start_node.get('lng')))}
        e_coords = {'lat': float(end_node['lat']), 'lon': float(end_node.get('lon', end_node.get('lng')))}

        print(f"🚌 Đang tìm Bus chặng {i+1}: {s_coords} -> {e_coords}")
        
        # Gọi lại hàm tìm đường đơn lẻ cũ
        result = find_smart_bus_route(s_coords, e_coords)
        
        if result['success']:
            # Đánh dấu đây là chặng thứ mấy
            result['data']['step_index'] = i
            total_segments.append(result['data'])
        else:
            # Nếu 1 chặng không có xe buýt, trả về lỗi hoặc fallback
            # Ở đây mình return lỗi luôn để báo người dùng
            return {
                'success': False, 
                'error': f"Không tìm thấy xe buýt cho chặng {i+1} (từ điểm {i+1} đến {i+2}). Vui lòng chọn phương tiện khác cho chặng này."
            }

    return {
        'success': True,
        'type': 'multi_stop',
        'data': {
            'total_legs': len(total_segments),
            'legs': total_segments # Mảng chứa chi tiết từng chặng A->B, B->C
        }
    }