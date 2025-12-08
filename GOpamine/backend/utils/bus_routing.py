import sqlite3
import math
import os
import requests 

# =========================================================
# 1. CẤU HÌNH & HÀM CƠ BẢN
# =========================================================
def get_db_path():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.abspath(os.path.join(current_dir, '../../data/busmap.db'))
    if not os.path.exists(db_path):
        fallback = os.path.abspath(os.path.join(current_dir, '../data/busmap.db'))
        if os.path.exists(fallback): return fallback
        return None
    return db_path

def get_db():
    db_path = get_db_path()
    if not db_path: raise FileNotFoundError("Không tìm thấy busmap.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

# =========================================================
# 2. HÀM VẼ ĐƯỜNG OSRM (ĐẸP & CHUNKING)
# =========================================================
def fetch_road_geometry(stops_list):
    if not stops_list or len(stops_list) < 2: return stops_list
    final_geometry = []
    CHUNK_SIZE = 25
    for i in range(0, len(stops_list) - 1, CHUNK_SIZE - 1):
        chunk = stops_list[i : i + CHUNK_SIZE]
        if len(chunk) < 2: continue
        coords_str = ";".join([f"{lon},{lat}" for lat, lon in chunk])
        url = f"http://router.project-osrm.org/route/v1/driving/{coords_str}?overview=full&geometries=geojson"
        try:
            resp = requests.get(url, timeout=2)
            if resp.status_code == 200 and resp.json()['code'] == 'Ok':
                geo = resp.json()['routes'][0]['geometry']['coordinates']
                converted = [[p[1], p[0]] for p in geo]
                if len(final_geometry) > 0: final_geometry.extend(converted[1:])
                else: final_geometry.extend(converted)
            else: final_geometry.extend(chunk)
        except: final_geometry.extend(chunk)
    return final_geometry

def get_path_smart(conn, route_id, direction, start_order, end_order):
    query = "SELECT Lat, Lng FROM stations WHERE RouteId=? AND StationDirection=? AND StationOrder >= ? AND StationOrder <= ? ORDER BY StationOrder ASC"
    rows = conn.execute(query, (route_id, direction, start_order, end_order)).fetchall()
    raw_stops = [[r['Lat'], r['Lng']] for r in rows]
    return fetch_road_geometry(raw_stops)

def get_route_info_safe(conn, route_id, direction):
    try:
        row = conn.execute("SELECT RouteNo, RouteName FROM routes WHERE RouteId = ?", (route_id,)).fetchone()
        if not row: return {'no': 'Bus', 'name': 'Unknown', 'desc': ''}
        d = dict(row)
        desc = ""
        try:
            ri = conn.execute("SELECT OutBoundDescription, InBoundDescription FROM route_info WHERE RouteId = ?", (route_id,)).fetchone()
            if ri: desc = ri['OutBoundDescription'] if direction == 0 else ri['InBoundDescription']
        except: pass
        return {'no': d['RouteNo'], 'name': d['RouteName'], 'desc': desc}
    except: return {'no': 'Bus', 'name': 'Unknown', 'desc': ''}

# =========================================================
# 3. THUẬT TOÁN TÌM ĐƯỜNG CẠNH TRANH (COMPETITIVE ROUTING)
# =========================================================
def find_smart_bus_route(start_coords, end_coords):
    print(f"\n🔍 [COMPETITIVE MODE] Tìm từ {start_coords} -> {end_coords}")
    conn = get_db()
    
    all_stops = conn.execute("SELECT StationId, StationName, Lat, Lng, RouteId, StationOrder, StationDirection FROM stations").fetchall()
    
    def get_candidates(limit_km):
        s_list, e_list = [], []
        for stop in all_stops:
            d_s = haversine(start_coords['lat'], start_coords['lon'], stop['Lat'], stop['Lng'])
            if d_s <= limit_km: s_list.append({**dict(stop), 'dist': d_s})
            d_e = haversine(end_coords['lat'], end_coords['lon'], stop['Lat'], stop['Lng'])
            if d_e <= limit_km: e_list.append({**dict(stop), 'dist': d_e})
        return s_list, e_list

    # --- CẤU HÌNH TRỌNG SỐ ---
    WEIGHT_WALK = 40.0      # Đi bộ 1km = 40 điểm phạt (Rất nặng)
    WEIGHT_STOP = 0.1       # 1 trạm = 0.1 điểm (Rất rẻ)
    TRANSFER_PENALTY = 15.0 # Đổi tuyến = 15 điểm phạt (Tương đương đi bộ 375m)
    
    # 1. Tìm ứng viên trong bán kính chuẩn (1.5km)
    s_close, e_close = get_candidates(1.5)
    
    # Nếu không có ứng viên gần, tự động mở rộng (Fallback)
    if not s_close or not e_close:
        print("   ⚠️ Không có trạm gần (1.5km). Mở rộng 3km...")
        s_close, e_close = get_candidates(3.0)

    # Danh sách chứa tất cả các giải pháp tiềm năng để so sánh
    potential_solutions = []

    # --- A. TÍNH TOÁN ĐI THẲNG (DIRECT) ---
    for s in s_close:
        for e in e_close:
            if s['RouteId'] == e['RouteId'] and s['StationDirection'] == e['StationDirection'] and s['StationOrder'] < e['StationOrder']:
                stops_count = e['StationOrder'] - s['StationOrder']
                walk_total = s['dist'] + e['dist']
                
                score = (walk_total * WEIGHT_WALK) + (stops_count * WEIGHT_STOP)
                # Phạt nặng nếu trạm xuống cách đích quá xa (>800m)
                if e['dist'] > 0.8: score += 50.0

                potential_solutions.append({
                    'type': 'direct',
                    'score': score,
                    'walk': walk_total,
                    'data': (s, e)
                })

    # --- B. TÍNH TOÁN CHUYỂN TUYẾN (TRANSFER) ---
    routes_s = {}; routes_e = {}
    for s in s_close: 
        if s['RouteId'] not in routes_s: routes_s[s['RouteId']] = []
        routes_s[s['RouteId']].append(s)
    for e in e_close: 
        if e['RouteId'] not in routes_e: routes_e[e['RouteId']] = []
        routes_e[e['RouteId']].append(e)

    for rid_s, s_list in routes_s.items():
        for rid_e, e_list in routes_e.items():
            if rid_s == rid_e: continue 
            
            # Chọn trạm gần nhất làm đại diện tính toán
            s_start = min(s_list, key=lambda x: x['dist'])
            e_end = min(e_list, key=lambda x: x['dist'])

            # Bỏ qua nếu trạm xuống của tuyến 2 quá xa đích (>1km)
            if e_end['dist'] > 1.0: continue

            # Tìm trạm chung
            query = """
                SELECT S1.StationName, S1.Lat, S1.Lng, S1.StationOrder as Order1, S2.StationOrder as Order2
                FROM stations S1
                JOIN stations S2 ON ABS(S1.Lat - S2.Lat) < 0.0005 AND ABS(S1.Lng - S2.Lng) < 0.0005
                WHERE S1.RouteId = ? AND S1.StationDirection = ?
                  AND S2.RouteId = ? AND S2.StationDirection = ?
                  AND S1.StationOrder > ? AND S2.StationOrder < ?
                LIMIT 1
            """
            trans = conn.execute(query, (rid_s, s_start['StationDirection'], rid_e, e_end['StationDirection'], s_start['StationOrder'], e_end['StationOrder'])).fetchone()

            if trans:
                walk_total = s_start['dist'] + e_end['dist']
                # Điểm số Transfer
                score = (walk_total * WEIGHT_WALK) + TRANSFER_PENALTY
                
                potential_solutions.append({
                    'type': 'transfer',
                    'score': score,
                    'walk': walk_total,
                    'data': (s_start, e_end, dict(trans))
                })

    # --- C. ĐẤU GIẢI (CHỌN RA CÁI TỐT NHẤT) ---
    if not potential_solutions:
        conn.close()
        return {'success': False, 'error': 'Không tìm thấy lộ trình phù hợp.'}

    # Sắp xếp: Score thấp nhất (Tốt nhất) lên đầu
    potential_solutions.sort(key=lambda x: x['score'])
    best = potential_solutions[0]
    
    print(f"   📊 So sánh {len(potential_solutions)} giải pháp:")
    for i, sol in enumerate(potential_solutions[:3]):
        print(f"      #{i+1} [{sol['type'].upper()}] Walk: {sol['walk']:.2f}km | Score: {sol['score']:.1f}")

    if best['type'] == 'direct':
        s, e = best['data']
        return build_response(conn, s, e, 'direct')
    else:
        s, e, t = best['data']
        return build_response(conn, s, e, 'transfer', t)

# Hàm đóng gói kết quả
def build_response(conn, start_node, end_node, type, transfer_node=None):
    if type == 'direct':
        info = get_route_info_safe(conn, start_node['RouteId'], start_node['StationDirection'])
        path = get_path_smart(conn, start_node['RouteId'], start_node['StationDirection'], start_node['StationOrder'], end_node['StationOrder'])
        conn.close()
        return {
            'success': True, 'type': 'direct',
            'data': {
                'route_name': f"Xe {info['no']}",
                'description': f"Lộ trình: {info['desc']}",
                'walk_to_start': [start_node['Lat'], start_node['Lng']],
                'walk_from_end': [end_node['Lat'], end_node['Lng']],
                'start_stop': start_node['StationName'],
                'end_stop': end_node['StationName'],
                'segments': [{'type': 'bus', 'path': path, 'name': info['no'], 'color': '#FF9800'}]
            }
        }
    elif type == 'transfer':
        info1 = get_route_info_safe(conn, start_node['RouteId'], start_node['StationDirection'])
        info2 = get_route_info_safe(conn, end_node['RouteId'], end_node['StationDirection'])
        
        path1 = get_path_smart(conn, start_node['RouteId'], start_node['StationDirection'], start_node['StationOrder'], transfer_node['Order1'])
        path2 = get_path_smart(conn, end_node['RouteId'], end_node['StationDirection'], transfer_node['Order2'], end_node['StationOrder'])
        conn.close()
        return {
            'success': True, 'type': 'transfer',
            'data': {
                'route_name': f"Xe {info1['no']} ➝ Xe {info2['no']}",
                'description': f"Đổi xe tại trạm {transfer_node['StationName']}",
                'walk_to_start': [start_node['Lat'], start_node['Lng']],
                'walk_from_end': [end_node['Lat'], end_node['Lng']],
                'start_stop': start_node['StationName'],
                'end_stop': end_node['StationName'],
                'segments': [
                    {'type': 'bus', 'path': path1, 'name': info1['no'], 'color': '#4285F4'},
                    {'type': 'transfer', 'lat': transfer_node['Lat'], 'lng': transfer_node['Lng'], 'name': transfer_node['StationName']},
                    {'type': 'bus', 'path': path2, 'name': info2['no'], 'color': '#EA4335'}
                ]
            }
        }

def plan_multi_stop_bus_trip(waypoints):
    if not waypoints or len(waypoints) < 2: return {'success': False, 'error': 'Cần >2 điểm'}
    legs = []
    for i in range(len(waypoints)-1):
        res = find_smart_bus_route(
            {'lat': float(waypoints[i]['lat']), 'lon': float(waypoints[i].get('lon', waypoints[i].get('lng')))}, 
            {'lat': float(waypoints[i+1]['lat']), 'lon': float(waypoints[i+1].get('lon', waypoints[i+1].get('lng')))}
        )
        if res['success']: 
            res['data']['step_index'] = i
            legs.append(res['data'])
        else: return {'success': False, 'error': f"Chặng {i+1} không có xe bus."}
    return {'success': True, 'type': 'multi_stop', 'data': {'legs': legs}}