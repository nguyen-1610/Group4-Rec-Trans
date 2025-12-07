import sqlite3
import math
import os
import requests # Cần import thư viện này để gọi OSRM
import json

# =========================================================
# 1. HÀM TÌM ĐƯỜNG DẪN DB
# =========================================================
def get_db_path():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Logic tìm file: utils -> backend -> GOpamine -> data
    db_path = os.path.abspath(os.path.join(current_dir, '../../data/busmap.db'))
    
    if not os.path.exists(db_path):
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
# 2. LOGIC TÍNH KHOẢNG CÁCH
# =========================================================

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def fetch_road_geometry(stops_list):
    """
    Input: Danh sách tọa độ các trạm [[lat, lon], [lat, lon]...]
    Output: Danh sách tọa độ chi tiết bám theo mặt đường (Geometry)
    """
    try:
        # Nếu ít hơn 2 trạm thì không vẽ được đường
        if not stops_list or len(stops_list) < 2:
            return stops_list

        # OSRM yêu cầu format: lon,lat;lon,lat (Lưu ý: lon trước lat sau)
        # Giới hạn URL của OSRM khoảng vài nghìn ký tự, nên nếu quá nhiều trạm cần chia nhỏ hoặc lọc bớt.
        # Ở đây ta lấy tối đa 25 điểm (Start, End và các trạm giữa) để OSRM nối.
        
        # Chiến thuật: Luôn lấy điểm đầu, điểm cuối, và rải đều các điểm giữa
        MAX_POINTS = 20
        if len(stops_list) > MAX_POINTS:
            step = len(stops_list) // MAX_POINTS
            filtered_stops = stops_list[::step]
            # Đảm bảo luôn có điểm cuối cùng
            if filtered_stops[-1] != stops_list[-1]:
                filtered_stops.append(stops_list[-1])
        else:
            filtered_stops = stops_list

        coords_str = ";".join([f"{lon},{lat}" for lat, lon in filtered_stops])
        
        # Gọi API OSRM (Profile driving để xe buýt chạy trên đường nhựa)
        url = f"http://router.project-osrm.org/route/v1/driving/{coords_str}?overview=full&geometries=geojson"
        
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data['code'] == 'Ok':
                # OSRM trả về [lon, lat], ta cần đảo lại thành [lat, lon] cho Leaflet
                geometry = data['routes'][0]['geometry']['coordinates']
                return [[c[1], c[0]] for c in geometry]
    except Exception as e:
        print(f"⚠️ Lỗi OSRM Bus Polyline: {e}. Dùng đường thẳng thay thế.")
    
    # Nếu lỗi, trả về đường thẳng nối các trạm như cũ (Fallback)
    return stops_list

# =========================================================
# 4. CÁC HÀM TRUY VẤN DB
# =========================================================

def get_route_info(conn, route_id):
    try:
        return conn.execute("SELECT RouteName, RouteNo, OutBoundDescription, InBoundDescription FROM route_info WHERE RouteId = ?", (route_id,)).fetchone()
    except:
        return None

def get_path_for_route(conn, route_id, direction, start_order, end_order):
    # Lấy tọa độ các trạm nằm giữa điểm đi và điểm đến
    query = """
        SELECT Lat, Lng 
        FROM stations 
        WHERE RouteId = ? AND StationDirection = ? 
          AND StationOrder >= ? AND StationOrder <= ? 
        ORDER BY StationOrder ASC
    """
    rows = conn.execute(query, (route_id, direction, start_order, end_order)).fetchall()
    
    # [FIX] Thay vì trả về luôn, ta đưa list này qua OSRM để làm mềm đường
    raw_stops = [[r['Lat'], r['Lng']] for r in rows]
    
    print(f"   🛤️ Đang tính geometry cho {len(raw_stops)} trạm...")
    smooth_path = fetch_road_geometry(raw_stops)
    return smooth_path

def find_smart_bus_route(start_coords, end_coords):
    print(f"\n🔍 [WEB REQUEST] Tìm từ {start_coords} đến {end_coords}")
    conn = get_db()
    
    try:
        all_stops = conn.execute("SELECT StationId, StationName, Lat, Lng, RouteId, StationOrder, StationDirection FROM stations").fetchall()
    except Exception as e:
        return {'success': False, 'error': f"Lỗi đọc DB: {str(e)}"}

    limit_dist = 5.0 
    start_candidates = []
    end_candidates = []

    for stop in all_stops:
        d_s = haversine(start_coords['lat'], start_coords['lon'], stop['Lat'], stop['Lng'])
        if d_s <= limit_dist:
            s = dict(stop); s['dist'] = d_s
            start_candidates.append(s)

        d_e = haversine(end_coords['lat'], end_coords['lon'], stop['Lat'], stop['Lng'])
        if d_e <= limit_dist:
            e = dict(stop); e['dist'] = d_e
            end_candidates.append(e)

    if not start_candidates or not end_candidates:
        return {'success': False, 'error': 'Không có trạm xe buýt nào gần bạn (3km).'}

    best_direct = None
    min_walk = float('inf')

    for s in start_candidates:
        for e in end_candidates:
            if s['RouteId'] == e['RouteId'] and s['StationDirection'] == e['StationDirection']:
                if s['StationOrder'] < e['StationOrder']:
                    total_walk = s['dist'] + e['dist']
                    if total_walk < min_walk:
                        min_walk = total_walk
                        best_direct = (s, e)

    if best_direct:
        s_stop, e_stop = best_direct
        print(f"   ✅ Tìm thấy tuyến ID: {s_stop['RouteId']}")
        
        r_info = get_route_info(conn, s_stop['RouteId'])
        route_no = r_info['RouteNo'] if r_info else "Bus"
        route_name = r_info['RouteName'] if r_info else "Unknown"
        desc = "Lộ trình đi thẳng"
        if r_info:
            raw_desc = r_info['OutBoundDescription'] if s_stop['StationDirection'] == 0 else r_info['InBoundDescription']
            if raw_desc: desc = raw_desc

        # Hàm này giờ đã trả về đường cong mềm mại
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
    return {'success': False, 'error': 'Không tìm thấy tuyến đi thẳng phù hợp.'}

# Tìm đa điểm
def plan_multi_stop_bus_trip(waypoints):
    if not waypoints or len(waypoints) < 2:
        return {'success': False, 'error': 'Cần ít nhất 2 điểm.'}

    total_segments = []
    
    for i in range(len(waypoints) - 1):
        start_node = waypoints[i]
        end_node = waypoints[i+1]
        
        s_coords = {'lat': float(start_node['lat']), 'lon': float(start_node.get('lon', start_node.get('lng')))}
        e_coords = {'lat': float(end_node['lat']), 'lon': float(end_node.get('lon', end_node.get('lng')))}

        print(f"🚌 Bus Chặng {i+1}: {s_coords} -> {e_coords}")
        
        result = find_smart_bus_route(s_coords, e_coords)
        
        if result['success']:
            result['data']['step_index'] = i
            total_segments.append(result['data'])
        else:
            return {'success': False, 'error': f"Không tìm thấy Bus chặng {i+1}."}

    return {
        'success': True,
        'type': 'multi_stop',
        'data': {
            'total_legs': len(total_segments),
            'legs': total_segments
        }
    }