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
    return conn

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

# =========================================================
# 2. HÀM VẼ ĐƯỜNG (DB PATHPOINTS)
# =========================================================
def parse_path_string(path_str):
    if not path_str or len(path_str) < 5: return []
    points = []
    try:
        raw_coords = path_str.strip().replace(';', ' ').split()
        for coord in raw_coords:
            if ',' in coord:
                parts = coord.split(',')
                try:
                    val1 = float(parts[0])
                    val2 = float(parts[1])
                    if val1 > 100 and val2 < 20: points.append([val2, val1])
                    elif val1 < 20 and val2 > 100: points.append([val1, val2])
                except: continue
    except: pass
    return points

def fetch_road_geometry_osrm(stops_list):
    if not stops_list or len(stops_list) < 2: return stops_list
    final_geometry = []
    CHUNK_SIZE = 25
    for i in range(0, len(stops_list) - 1, CHUNK_SIZE - 1):
        chunk = stops_list[i : i + CHUNK_SIZE]
        if len(chunk) < 2: continue
        coords_str = ";".join([f"{lon},{lat}" for lat, lon in chunk])
        url = f"http://router.project-osrm.org/route/v1/driving/{coords_str}?overview=full&geometries=geojson"
        try:
            resp = requests.get(url, timeout=1.0)
            if resp.status_code == 200 and resp.json()['code'] == 'Ok':
                geo = resp.json()['routes'][0]['geometry']['coordinates']
                converted = [[p[1], p[0]] for p in geo]
                if len(final_geometry) > 0: final_geometry.extend(converted[1:])
                else: final_geometry.extend(converted)
            else: final_geometry.extend(chunk)
        except: final_geometry.extend(chunk)
    return final_geometry

def get_official_path_from_db(conn, route_id, direction, start_order, end_order):
    try:
        query = "SELECT pathPoints FROM stations WHERE RouteId = ? AND StationDirection = ? AND StationOrder >= ? AND StationOrder <= ? ORDER BY StationOrder ASC"
        rows = conn.execute(query, (route_id, direction, start_order, end_order)).fetchall()
        full_path = []
        has_path = False
        for row in rows:
            if row[0]:
                seg = parse_path_string(row[0])
                if seg:
                    full_path.extend(seg)
                    has_path = True
        end_node = conn.execute("SELECT Lat, Lng FROM stations WHERE RouteId=? AND StationDirection=? AND StationOrder=?", (route_id, direction, end_order)).fetchone()
        if end_node: full_path.append([end_node[0], end_node[1]])

        if has_path and len(full_path) > 1: return full_path
    except: pass

    try:
        query = "SELECT Lat, Lng FROM stations WHERE RouteId=? AND StationDirection=? AND StationOrder >= ? AND StationOrder <= ? ORDER BY StationOrder ASC"
        rows = conn.execute(query, (route_id, direction, start_order, end_order)).fetchall()
        raw = [[r[0], r[1]] for r in rows]
        return fetch_road_geometry_osrm(raw)
    except: return []

def get_route_no(conn, route_id):
    try:
        r = conn.execute("SELECT RouteNo FROM routes WHERE RouteId = ?", (route_id,)).fetchone()
        return str(r[0]) if r else "Bus"
    except: return "Bus"

def get_route_name(conn, route_id):
    try:
        r = conn.execute("SELECT RouteNo, RouteName FROM routes WHERE RouteId = ?", (route_id,)).fetchone()
        return f"{r[0]} - {r[1]}" if r else "Bus"
    except: return "Bus"

# =========================================================
# 3. THUẬT TOÁN TÌM ĐƯỜNG (REALISTIC SCORING)
# =========================================================
def find_smart_bus_route(start_coords, end_coords):
    print(f"\n🔍 [REALISTIC MODE] Tìm từ {start_coords} -> {end_coords}")
    conn = get_db()
    all_stops = conn.execute("SELECT StationId, StationName, Lat, Lng, RouteId, StationOrder, StationDirection FROM stations").fetchall()
    
    # DANH SÁCH TUYẾN XƯƠNG SỐNG (Ưu tiên)
    BACKBONE_ROUTES = ['19', '53', '150', '8', '6', '56', '10', '30', '104', '33', '99', '152']
    
    route_no_cache = {}
    def is_backbone(rid):
        if rid not in route_no_cache:
            route_no_cache[rid] = get_route_no(conn, rid)
        return route_no_cache[rid] in BACKBONE_ROUTES

    def get_nearby_routes(coords, radius_km):
        routes = {}
        for stop in all_stops:
            s_lat, s_lng = stop[2], stop[3]
            dist = haversine(coords['lat'], coords['lon'], s_lat, s_lng)
            if dist <= radius_km:
                key = (stop[4], stop[6]) # RouteId, Direction
                if key not in routes or dist < routes[key]['dist']:
                    routes[key] = {
                        'StationId': stop[0], 'StationName': stop[1], 'Lat': s_lat, 'Lng': s_lng,
                        'RouteId': stop[4], 'StationOrder': stop[5], 'StationDirection': stop[6],
                        'dist': dist
                    }
        return routes

    # 1. Tìm trạm (Quét rộng để bắt tuyến xương sống)
    s_close = get_nearby_routes(start_coords, 2.0)
    e_close = get_nearby_routes(end_coords, 2.0)

    if not e_close: e_close = get_nearby_routes(end_coords, 4.0)

    if not s_close or not e_close:
        conn.close()
        return {'success': False, 'error': 'Không có xe buýt.'}

    potential_solutions = []
    
    # --- CẤU HÌNH TRỌNG SỐ THỰC TẾ ---
    WEIGHT_WALK = 100.0     # Đi bộ 1km = 100 điểm phạt (Rất nặng)
    WEIGHT_STOP = 0.5       # 1 trạm = 0.5 điểm
    TRANSFER_PENALTY = 50.0 # Đổi tuyến = 50 điểm (~500m đi bộ)
    
    # Bonus cho tuyến đi thẳng
    BASE_DIRECT_BONUS = -200.0
    BACKBONE_BONUS = -100.0

    # A. DIRECT
    print("   🚀 Quét Direct...")
    for key, s in s_close.items():
        if key in e_close:
            e = e_close[key]
            if s['StationOrder'] < e['StationOrder']:
                walk_total = s['dist'] + e['dist']
                stops = e['StationOrder'] - s['StationOrder']
                
                # NẾU ĐI BỘ QUÁ XA (>2km) -> CẮT BỎ PHẦN THƯỞNG
                direct_bonus = BASE_DIRECT_BONUS
                if walk_total > 1.5: direct_bonus = 0  # Hết thưởng nếu đi bộ xa
                if walk_total > 2.0: direct_bonus = 200 # Phạt ngược lại nếu đi bộ quá 2km

                # Thưởng thêm cho tuyến xương sống
                bb_bonus = BACKBONE_BONUS if is_backbone(key[0]) else 0

                score = (walk_total * WEIGHT_WALK) + (stops * WEIGHT_STOP) + direct_bonus + bb_bonus
                
                potential_solutions.append({'type': 'direct', 'score': score, 'walk': walk_total, 'stops': stops, 'data': (s, e)})

    # B. TRANSFER
    check_transfer = True
    if potential_solutions:
        best_direct = min(potential_solutions, key=lambda x: x['score'])
        # Chỉ bỏ qua Transfer nếu có Direct CỰC NGON (đi bộ < 500m)
        if best_direct['walk'] < 0.5: check_transfer = False

    if check_transfer:
        print("   🔄 Quét Transfer...")
        top_s = sorted(s_close.values(), key=lambda x: x['dist'])[:20]
        top_e = sorted(e_close.values(), key=lambda x: x['dist'])[:20]

        for s in top_s:
            for e in top_e:
                if s['RouteId'] == e['RouteId']: continue
                
                # Hub Matching
                query = """
                    SELECT S1.StationName, S1.Lat, S1.Lng, S1.StationOrder as Order1, S2.StationOrder as Order2
                    FROM stations S1
                    JOIN stations S2 ON 
                        (ABS(S1.Lat - S2.Lat) < 0.005 AND ABS(S1.Lng - S2.Lng) < 0.005)
                        OR S1.StationName = S2.StationName
                    WHERE S1.RouteId = ? AND S1.StationDirection = ?
                      AND S2.RouteId = ? AND S2.StationDirection = ?
                      AND S1.StationOrder > ? AND S2.StationOrder < ?
                    LIMIT 1
                """
                trans_row = conn.execute(query, (s['RouteId'], s['StationDirection'], e['RouteId'], e['StationDirection'], s['StationOrder'], e['StationOrder'])).fetchone()
                
                if trans_row:
                    trans = {'StationName': trans_row[0], 'Lat': trans_row[1], 'Lng': trans_row[2], 'Order1': trans_row[3], 'Order2': trans_row[4]}
                    walk_total = s['dist'] + e['dist']
                    stops_total = (trans['Order1'] - s['StationOrder']) + (e['StationOrder'] - trans['Order2'])
                    
                    # Phạt nặng nếu tổng trạm > 70
                    penalty = 0
                    if stops_total > 70: penalty = 500

                    score = (walk_total * WEIGHT_WALK) + (stops_total * WEIGHT_STOP) + TRANSFER_PENALTY + penalty
                    potential_solutions.append({'type': 'transfer', 'score': score, 'walk': walk_total, 'stops': stops_total, 'data': (s, e, trans)})

    # --- KẾT QUẢ ---
    if not potential_solutions:
        conn.close()
        return {'success': False, 'error': 'Không tìm thấy.'}

    potential_solutions.sort(key=lambda x: x['score'])
    best = potential_solutions[0]
    
    r_lbl = get_route_name(conn, best['data'][0]['RouteId'])
    print(f"   🏆 Chọn: {best['type'].upper()} ({r_lbl}) | Walk: {best['walk']:.2f}km | Score: {best['score']:.1f}")

    if best['type'] == 'direct':
        return build_response(conn, best['data'][0], best['data'][1], 'direct')
    else:
        return build_response(conn, best['data'][0], best['data'][1], 'transfer', best['data'][2])

def build_response(conn, s, e, type, trans=None):
    if type == 'direct':
        name = get_route_name(conn, s['RouteId'])
        path = get_official_path_from_db(conn, s['RouteId'], s['StationDirection'], s['StationOrder'], e['StationOrder'])
        conn.close()
        return {'success': True, 'type': 'direct', 'data': {'route_name': f"Xe {name}", 'description': f"Đi thẳng tuyến {name}", 'walk_to_start': [s['Lat'], s['Lng']], 'walk_from_end': [e['Lat'], e['Lng']], 'start_stop': s['StationName'], 'end_stop': e['StationName'], 'walk_distance': round((s.get('dist', 0) + e.get('dist', 0)) * 1000), 'segments': [{'type': 'bus', 'path': path, 'name': name, 'color': '#FF9800'}]}}
    else:
        name1 = get_route_name(conn, s['RouteId'])
        name2 = get_route_name(conn, e['RouteId'])
        path1 = get_official_path_from_db(conn, s['RouteId'], s['StationDirection'], s['StationOrder'], trans['Order1'])
        path2 = get_official_path_from_db(conn, e['RouteId'], e['StationDirection'], trans['Order2'], e['StationOrder'])
        conn.close()
        return {'success': True, 'type': 'transfer', 'data': {'route_name': f"Xe {name1} ➝ Xe {name2}", 'description': f"Đổi xe tại {trans['StationName']}", 'walk_to_start': [s['Lat'], s['Lng']], 'walk_from_end': [e['Lat'], e['Lng']], 'start_stop': s['StationName'], 'end_stop': e['StationName'], 'transfer_stop': trans['StationName'], 'walk_distance': round((s.get('dist', 0) + e.get('dist', 0)) * 1000), 'segments': [{'type': 'bus', 'path': path1, 'name': name1, 'color': '#4285F4'}, {'type': 'transfer', 'lat': trans['Lat'], 'lng': trans['Lng'], 'name': trans['StationName']}, {'type': 'bus', 'path': path2, 'name': name2, 'color': '#EA4335'}]}}

def plan_multi_stop_bus_trip(waypoints):
    if len(waypoints) < 2: return {'success': False, 'error': 'Cần >2 điểm'}
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