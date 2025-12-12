import sqlite3
import math
import os
import requests 
import logging  
from datetime import datetime  

# ========== THÊM SETUP LOGGING ==========
def setup_route_logger():
    """Tạo logger riêng cho bus routing"""
    log_dir = os.path.join(os.path.dirname(__file__), '../../logs')
    os.makedirs(log_dir, exist_ok=True)
    
    log_file = os.path.join(log_dir, f'bus_routing_{datetime.now().strftime("%Y%m%d")}.log')
    
    logger = logging.getLogger('bus_routing')
    logger.setLevel(logging.INFO)
    
    # Tránh duplicate handlers
    if not logger.handlers:
        handler = logging.FileHandler(log_file, encoding='utf-8')
        handler.setFormatter(logging.Formatter(
            '%(asctime)s [%(levelname)s] %(message)s',
            datefmt='%H:%M:%S'
        ))
        logger.addHandler(handler)
    
    return logger

route_logger = setup_route_logger()
# =========================================

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
    """
    Gọi OSRM API để lấy đường đi thực tế
    IMPROVED: Retry logic, better timeout, error handling
    """
    if not stops_list or len(stops_list) < 2:
        return stops_list
    
    final_geometry = []
    CHUNK_SIZE = 25
    MAX_RETRIES = 2
    
    for i in range(0, len(stops_list) - 1, CHUNK_SIZE - 1):
        chunk = stops_list[i : i + CHUNK_SIZE]
        if len(chunk) < 2:
            continue
        
        coords_str = ";".join([f"{lon},{lat}" for lat, lon in chunk])
        url = f"http://router.project-osrm.org/route/v1/driving/{coords_str}?overview=full&geometries=geojson"
        
        success = False
        
        for attempt in range(MAX_RETRIES):
            try:
                resp = requests.get(url, timeout=3.0)  # Tăng timeout
                
                if resp.status_code == 200:
                    data = resp.json()
                    
                    if data.get('code') == 'Ok':
                        geo = data['routes'][0]['geometry']['coordinates']
                        converted = [[p[1], p[0]] for p in geo]  # Swap lon/lat → lat/lon
                        
                        # Nối segment (tránh duplicate điểm)
                        if len(final_geometry) > 0:
                            final_geometry.extend(converted[1:])
                        else:
                            final_geometry.extend(converted)
                        
                        success = True
                        break
                    else:
                        route_logger.warning(f"OSRM_CODE_ERROR | Code={data.get('code')} | Attempt={attempt+1}")
                        
            except requests.Timeout:
                route_logger.warning(f"OSRM_TIMEOUT | Attempt={attempt+1}/{MAX_RETRIES}")
                if attempt < MAX_RETRIES - 1:
                    import time
                    time.sleep(0.5)
                    
            except Exception as e:
                route_logger.warning(f"OSRM_ERROR | Error={str(e)} | Attempt={attempt+1}")
                break
        
        # Nếu tất cả retry đều fail → dùng đường thẳng
        if not success:
            route_logger.error(f"OSRM_FALLBACK_STRAIGHT | Chunk={i//CHUNK_SIZE}")
            final_geometry.extend(chunk)
    
    return final_geometry

def get_official_path_from_db(conn, route_id, direction, start_order, end_order):
    """
    Lấy đường đi thực tế từ database với pathPoints
    FIX: Thêm start station, detect gap, improve fallback
    """
    try:
        # ========== BƯỚC 1: LẤY TỌA ĐỘ TRẠM ĐẦU (CRITICAL!) ==========
        start_station = conn.execute(
            "SELECT Lat, Lng, StationName FROM stations WHERE RouteId=? AND StationDirection=? AND StationOrder=?",
            (route_id, direction, start_order)
        ).fetchone()
        
        if not start_station:
            route_logger.error(f"MISSING_START | RouteID={route_id} Dir={direction} Order={start_order}")
            raise Exception("Không tìm thấy trạm đầu")
        
        # Khởi tạo path với điểm đầu tiên
        full_path = [[start_station[0], start_station[1]]]
        route_logger.info(f"PATH_START | Route={route_id} | Station={start_station[2]} | Coord=[{start_station[0]:.6f}, {start_station[1]:.6f}]")
        
        # ========== BƯỚC 2: LẤY PATHPOINTS TỪ CÁC TRẠM ==========
        query = """
            SELECT StationOrder, StationName, pathPoints, Lat, Lng
            FROM stations 
            WHERE RouteId = ? AND StationDirection = ? 
            AND StationOrder >= ? AND StationOrder < ?
            ORDER BY StationOrder ASC
        """
        rows = conn.execute(query, (route_id, direction, start_order, end_order)).fetchall()
        
        has_valid_path = False
        total_gaps = 0
        
        for row in rows:
            order, name, path_str, lat, lng = row
            
            if path_str:
                segment = parse_path_string(path_str)
                
                if segment and len(segment) > 0:
                    # Kiểm tra ngắt quãng
                    last_point = full_path[-1]
                    first_new = segment[0]
                    gap_distance = haversine(last_point[0], last_point[1], first_new[0], first_new[1])
                    
                    if gap_distance > 0.05:  # Ngắt quãng >50m
                        total_gaps += 1
                        route_logger.warning(
                            f"GAP_DETECTED | Route={route_id} Order={order} | "
                            f"Gap={gap_distance*1000:.0f}m | Station={name}"
                        )
                        # Nối thẳng bằng cách thêm tọa độ trạm làm điểm trung gian
                        full_path.append([lat, lng])
                    
                    # Thêm segment vào path
                    full_path.extend(segment)
                    has_valid_path = True
                else:
                    # PathPoints parse fail → dùng tọa độ trạm
                    route_logger.warning(f"PARSE_FAIL | Route={route_id} Order={order} | Station={name}")
                    full_path.append([lat, lng])
            else:
                # Không có pathPoints → dùng tọa độ trạm
                full_path.append([lat, lng])
        
        # ========== BƯỚC 3: THÊM TRẠM CUỐI ==========
        end_station = conn.execute(
            "SELECT Lat, Lng, StationName FROM stations WHERE RouteId=? AND StationDirection=? AND StationOrder=?",
            (route_id, direction, end_order)
        ).fetchone()
        
        if end_station:
            last_point = full_path[-1]
            dist_to_end = haversine(last_point[0], last_point[1], end_station[0], end_station[1])
            
            if dist_to_end > 0.01:  # Nếu còn cách >10m thì thêm
                full_path.append([end_station[0], end_station[1]])
                route_logger.info(f"PATH_END | Route={route_id} | Station={end_station[2]} | EndGap={dist_to_end*1000:.0f}m")
        
        # ========== KIỂM TRA CHẤT LƯỢNG PATH ==========
        if has_valid_path and len(full_path) > 1:
            route_logger.info(
                f"PATH_SUCCESS | Route={route_id} | Points={len(full_path)} | "
                f"Gaps={total_gaps} | Source=DATABASE"
            )
            return full_path
        else:
            route_logger.warning(f"PATH_INCOMPLETE | Route={route_id} | Points={len(full_path)} | Fallback to OSRM")
            raise Exception("PathPoints không đầy đủ, chuyển sang OSRM")
            
    except Exception as e:
        route_logger.warning(f"PATH_ERROR | Route={route_id} | Error={str(e)} | Using OSRM fallback")
    
    # ========== FALLBACK: DÙNG OSRM ==========
    try:
        query = """
            SELECT Lat, Lng FROM stations 
            WHERE RouteId=? AND StationDirection=? 
            AND StationOrder >= ? AND StationOrder <= ? 
            ORDER BY StationOrder ASC
        """
        rows = conn.execute(query, (route_id, direction, start_order, end_order)).fetchall()
        
        if not rows:
            route_logger.error(f"OSRM_NO_STATIONS | Route={route_id}")
            return []
        
        raw_coords = [[r[0], r[1]] for r in rows]
        osrm_path = fetch_road_geometry_osrm(raw_coords)
        
        route_logger.info(
            f"PATH_SUCCESS | Route={route_id} | Points={len(osrm_path)} | "
            f"Source=OSRM | Stations={len(rows)}"
        )
        return osrm_path
        
    except Exception as e:
        route_logger.error(f"OSRM_FAIL | Route={route_id} | Error={str(e)}")
        return []
# =========================================================
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

def validate_route_quality(conn, route_id, direction):
    """
    Kiểm tra chất lượng tuyến trước khi sử dụng
    Tiêu chí: 
    1. Đủ số trạm tối thiểu (tránh tuyến rác).
    2. Các trạm phải liền mạch (không cách nhau quá xa theo đường chim bay).
    Returns: (is_valid, error_message)
    """
    try:
        # CẤU HÌNH BỘ LỌC
        MIN_STOPS = 5          # Giảm xuống 5 để không bị sót các tuyến ngắn
        MAX_GAP_KM = 2.5       # Nếu 2 trạm liền kề cách nhau > 2.5km -> Loại
        
        # 1. Lấy danh sách trạm và tọa độ (Sắp xếp theo thứ tự)
        query = "SELECT StationName, Lat, Lng FROM stations WHERE RouteId = ? AND StationDirection = ? ORDER BY StationOrder"
        stations = conn.execute(query, (route_id, direction)).fetchall()
        
        count = len(stations)
        route_name = get_route_name(conn, route_id)

        # 2. Kiểm tra số lượng trạm
        if count < MIN_STOPS:
            error_msg = f"Tuyến {route_name} quá ngắn: chỉ có {count} trạm (yêu cầu ≥{MIN_STOPS})"
            route_logger.warning(f"REJECTED_SHORT | RouteID={route_id} | {error_msg}")
            return (False, error_msg)
        
        # 3. [NEW] Kiểm tra khoảng cách "nhảy cóc" giữa các trạm
        # Nếu trạm A và trạm B cách nhau quá xa, nghĩa là database bị thiếu dữ liệu đường đi ở giữa
        for i in range(count - 1):
            # Trạm hiện tại
            s1_name, lat1, lng1 = stations[i]
            # Trạm kế tiếp
            s2_name, lat2, lng2 = stations[i+1]
            
            # Tính khoảng cách chim bay
            dist = haversine(lat1, lng1, lat2, lng2)
            
            if dist > MAX_GAP_KM:
                error_msg = f"Phát hiện đứt quãng {dist:.2f}km giữa trạm '{s1_name}' và '{s2_name}'"
                route_logger.warning(f"REJECTED_GAP | RouteID={route_id} | {error_msg}")
                return (False, f"Tuyến {route_name} bị lỗi dữ liệu (ngắt quãng lớn)")

        # 4. Kiểm tra PathPoints (Optional - Chỉ log cảnh báo chứ không loại)
        has_path = conn.execute(
            "SELECT COUNT(*) FROM stations WHERE RouteId = ? AND StationDirection = ? AND pathPoints IS NOT NULL",
            (route_id, direction)
        ).fetchone()[0]
        
        if has_path < count * 0.3: # Nếu dưới 30% trạm có pathPoints
            route_logger.info(f"LOW_QUALITY_PATH | RouteID={route_id} | Chỉ {has_path}/{count} trạm có pathPoints")

        return (True, None)
        
    except Exception as e:
        route_logger.error(f"VALIDATE_ERROR | RouteID={route_id} Dir={direction} | {str(e)}")
        return (False, f"Lỗi kiểm tra tuyến: {str(e)}")

# =========================================================
# 3. THUẬT TOÁN TÌM ĐƯỜNG (REALISTIC SCORING)
# =========================================================
def find_smart_bus_route(start_coords, end_coords, **kwargs):
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

     # ========== THÊM CACHE VALIDATION ==========
    route_quality_cache = {}
    def is_valid_route(rid, direction):
        """Kiểm tra tuyến có đủ tiêu chuẩn không"""
        key = (rid, direction)
        if key not in route_quality_cache:
            is_valid, error = validate_route_quality(conn, rid, direction)
            route_quality_cache[key] = is_valid
            if not is_valid:
                print(f"❌ {error}")
        return route_quality_cache[key]
    # ==========================================
    
    def get_nearby_routes(coords, radius_km):
        routes = {}
        for stop in all_stops:
            s_lat, s_lng = stop[2], stop[3]
            dist = haversine(coords['lat'], coords['lon'], s_lat, s_lng)
            if dist <= radius_km:
                key = (stop[4], stop[6]) # RouteId, Direction
                
                # ========== THÊM CHECK Ở ĐÂY ==========
                if not is_valid_route(stop[4], stop[6]):
                    continue  # Bỏ qua tuyến không hợp lệ
                # ==========================================
                
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
        # ========== LOG THẤT BẠI ==========
        route_logger.warning(
            f"NOT_FOUND | Start={start_coords} End={end_coords} | "
            f"StartRoutes={len(s_close)} EndRoutes={len(e_close)}"
        )
        # ==================================
        
        conn.close()
        # ========== SỬA MESSAGE ==========
        return {
            'success': False, 
            'error': 'Không tìm thấy tuyến xe bus phù hợp (chỉ hiển thị tuyến có ≥10 trạm). Vui lòng thử điểm khác hoặc mở rộng bán kính tìm kiếm.'
        }
        # =================================

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

    # Sắp xếp theo điểm
    potential_solutions.sort(key=lambda x: x['score'])
    
    # [NEW] LOGIC LỌC THÔNG MINH (SMART FILTERING)
    # Thay vì lấy ngu ngơ top 3, ta sẽ chọn lọc kỹ càng
    
    final_picks = []
 
    # AN TOÀN: Kiểm tra rỗng trước khi truy cập phần tử [0]
    if potential_solutions:
        # Luôn chọn phương án tốt nhất (Top 1)
        best_option = potential_solutions[0]
        final_picks.append(best_option)
        
        limit = kwargs.get('limit', 3)
        # Duyệt qua các phương án còn lại để xem có nên lấy không
        for sol in potential_solutions[1:]:
            # Đã đủ số lượng cần tìm thì dừng
            if len(final_picks) >= limit: 
                break
                
            # 1. BỘ LỌC ĐI BỘ QUÁ XA (HARD LIMIT)
            # Nếu tổng đi bộ > 1.5km -> Loại ngay lập tức (Tuyến 27 đi bộ 1.7km sẽ chết ở đây)
            if sol['walk'] > 1.5:
                continue

            # 2. BỘ LỌC SO SÁNH (RELATIVE CHECK)
            # Nếu phương án này phải đi bộ nhiều hơn phương án nhất quá 800m -> Loại
            # Ví dụ: Tuyến 69 đi bộ 200m. Tuyến 27 đi bộ 1.1km (chênh 900m) -> Loại
            if sol['walk'] > (best_option['walk'] + 0.8):
                continue
                
            # 3. BỘ LỌC ĐIỂM SỐ (SCORE GAP)
            # Nếu điểm số chênh lệch quá lớn so với top 1 (quá 200 điểm) -> Loại
            if sol['score'] > (best_option['score'] + 200):
                continue
                
            # Nếu vượt qua mọi bài test thì mới nhận
            final_picks.append(sol)
        # Gán lại vào top_solutions để code phía dưới xử lý tiếp
        top_solutions = final_picks
    else:
        # Trường hợp không tìm thấy gì
        top_solutions = []
    
    # --- KẾT THÚC ĐOẠN LỌC ---
    
    # Log lựa chọn tốt nhất
    best = top_solutions[0]
    r_lbl = get_route_name(conn, best['data'][0]['RouteId'])
    print(f"   🏆 Tốt nhất: {best['type'].upper()} ({r_lbl}) | Walk: {best['walk']:.2f}km | Score: {best['score']:.1f}")
    
    route_logger.info(
        f"FOUND | Type={best['type'].upper()} | Route={r_lbl} | "
        f"Walk={best['walk']:.2f}km | Stops={best['stops']} | Score={best['score']:.1f}"
    )
    
    # Build response cho từng option
    final_results = []
    for sol in top_solutions:
        if sol['type'] == 'direct':
            res = build_response(conn, sol['data'][0], sol['data'][1], 'direct')
        else:
            res = build_response(conn, sol['data'][0], sol['data'][1], 'transfer', sol['data'][2])
        
        if res['success']:
            final_results.append(res['data'])
    
    conn.close()  # ✅ Đóng connection Ở ĐÂY, sau khi xong vòng lặp
    
    return {
        'success': True,
        'count': len(final_results),
        'routes': final_results  # ✅ Đổi key từ 'data' → 'routes' cho rõ ràng
    }

def build_response(conn, s, e, type, trans=None):
    """
    Xây dựng object JSON trả về cho Frontend.
    [CHANGE]: Không đóng connection ở đây để dùng cho vòng lặp.
    """
    if type == 'direct':
        name = get_route_name(conn, s['RouteId'])
        path = get_official_path_from_db(conn, s['RouteId'], s['StationDirection'], s['StationOrder'], e['StationOrder'])

        return {
            'success': True, 
            'type': 'direct', 
            'data': {
                'route_name': f"Xe {name}",
                'description': f"Đi thẳng tuyến {name}",
                # [NEW] Thêm ID để frontend phân biệt các option
                'option_id': f"direct_{s['RouteId']}_{s['StationId']}",
                
                'walk_to_start': [s['Lat'], s['Lng']], 
                'walk_from_end': [e['Lat'], e['Lng']], 
                
                'start_stop': s['StationName'], 
                'end_stop': e['StationName'], 
                
                'station_start_coords': {'lat': s['Lat'], 'lng': s['Lng']},
                'station_end_coords': {'lat': e['Lat'], 'lng': e['Lng']},
               
                'walk_distance': round((s.get('dist', 0) + e.get('dist', 0)) * 1000), 
                'duration': round((len(path) * 0.1) + 10), # Ước lượng
                
                'score': 8.5,
                'labels': ["Tiết kiệm", "Đi thẳng"],
                'route_coordinates': path,
                'segments': [{'type': 'bus', 'path': path, 'name': name, 'color': '#FF9800'}]
            }
        }
    else:
        name1 = get_route_name(conn, s['RouteId'])
        name2 = get_route_name(conn, e['RouteId'])
        path1 = get_official_path_from_db(conn, s['RouteId'], s['StationDirection'], s['StationOrder'], trans['Order1'])
        path2 = get_official_path_from_db(conn, e['RouteId'], e['StationDirection'], trans['Order2'], e['StationOrder'])
        
        return {
            'success': True,
            'type': 'transfer', 
            'data': {
                'route_name': f"Xe {name1} ➝ Xe {name2}", 
                'description': f"Đổi xe tại {trans['StationName']}", 
                # [NEW] Thêm ID
                'option_id': f"trans_{s['RouteId']}_{e['RouteId']}",
                'walk_to_start': [s['Lat'], s['Lng']],
                'walk_from_end': [e['Lat'], e['Lng']], 
                'start_stop': s['StationName'], 
                'end_stop': e['StationName'], 
                
                'transfer_stop': trans['StationName'],
                'station_start_coords': {'lat': s['Lat'], 'lng': s['Lng']},
                'station_end_coords': {'lat': e['Lat'], 'lng': e['Lng']},
                
                'walk_distance': round((s.get('dist', 0) + e.get('dist', 0)) * 1000), 
                'duration': round((len(path1) + len(path2)) * 0.1 + 20),
                'display_price': "14,000đ",
                'score': 6.5,
                'labels': ["Phổ biến", "2 chuyến"],
                'route_coordinates': path1 + path2,
                
                'segments': [
                    {'type': 'bus', 'path': path1, 'name': name1, 'color': '#4285F4'}, 
                    {'type': 'transfer', 'lat': trans['Lat'], 'lng': trans['Lng'], 'name': trans['StationName']},
                    {'type': 'bus', 'path': path2, 'name': name2, 'color': '#EA4335'}
                ]
            }
        }

def plan_multi_stop_bus_trip(waypoints):
    if len(waypoints) < 2: return {'success': False, 'error': 'Cần >2 điểm'}
    legs = []
    total_price = 0
    full_route_coords = []
    
    for i in range(len(waypoints)-1):
        res = find_smart_bus_route(
            {'lat': float(waypoints[i]['lat']), 'lon': float(waypoints[i].get('lon', waypoints[i].get('lng')))}, 
            {'lat': float(waypoints[i+1]['lat']), 'lon': float(waypoints[i+1].get('lon', waypoints[i+1].get('lng')))},
            limit=1
        )
        
        if res['success'] and len(res['routes']) > 0: 
            # Lấy option đầu tiên (tốt nhất)
            best_leg = res['routes'][0]
            best_leg['step_index'] = i
            legs.append(best_leg)
            
            # Cộng dồn
            full_route_coords.extend(best_leg['route_coordinates'])
            try: total_price += int(str(best_leg['display_price']).replace('đ','').replace(',',''))
            except: pass
            
        else: return {'success': False, 'error': f"Chặng {i+1} không có xe bus."}
    return {
        'success': True, 
        'type': 'multi_stop', 
        'data': {
            'mode_name': "Hành trình Bus Đa Điểm",
            'legs': legs,
            'route_coordinates': full_route_coords,
            'display_price': f"{total_price:,}đ",
            'duration': sum(l['duration'] for l in legs),
            'segments': legs[0]['segments'] # Fallback
        }
    }