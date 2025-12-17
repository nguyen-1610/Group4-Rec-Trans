import math
import os
import requests 
import logging  
from datetime import datetime 
from backend.database.supabase_client import supabase
from backend.routes.bus_manager import (
    find_nearby_stations,
    get_stations_by_route,
    get_transfer_stations,
    bus_data
)
from backend.utils.cache_layer import (
    cache_get,
    cache_set,
    cache_key,
)

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

def get_official_path_from_db(route_id, direction, start_order, end_order):
    """
    FIX CUỐI CÙNG: Nối segment ĐÚNG, không vẽ chồng
    
    Key insight: 
      - Không thêm trạm giữa 2 segment
      - Thay vào đó: Nối thẳng từ điểm cuối path A → điểm đầu path B
      - Nếu có gap → thêm điểm trạm làm điểm trung gian
    """
    # Check cache trước
    cache_key_str = cache_key("path", route_id, direction, start_order, end_order)
    cached_path = cache_get(cache_key_str)
    if cached_path:
        route_logger.info(f"PATH_HIT | Cache hit for {cache_key_str}")
        return cached_path
    
    try:
        # Lấy tất cả trạm của tuyến từ cache (instant!)
        all_stations = get_stations_by_route(route_id, direction)
        
        # Filter theo order nếu cần
        stations = [
            s for s in all_stations
            if start_order <= s.get('StationOrder', 0) <= end_order
        ]
        
        if not stations:
            route_logger.error(f"NO_DATA | RouteID={route_id}")
            return []
        
    except Exception as e:
        route_logger.error(f"CACHE_ERROR | RouteID={route_id} | {str(e)}")
        return []
    
    # ========== KHỞI TẠO ==========
    first_station = stations[0]
    full_path = [[first_station.get('Lat'), first_station.get('Lng')]]
    has_detailed_path = False
    total_gaps = 0
    
    route_logger.info(
        f"PATH_START | Route={route_id} | Station={first_station.get('StationName')} | "
        f"Coord=[{full_path[0][0]:.6f}, {full_path[0][1]:.6f}]"
    )
    
    # ========== LOOP XỬ LÝ SEGMENTS ==========
    for idx, station in enumerate(stations):
        lat = station.get('Lat')
        lng = station.get('Lng')
        name = station.get('StationName', 'Unknown')
        order = station.get('StationOrder')
        path_str = station.get('pathPoints')
        
        # ✅ CHỈ process pathPoints, KHÔNG thêm trạm vào đây
        if path_str and len(path_str) > 5:
            try:
                segment = parse_path_string(path_str)
                
                if segment and len(segment) > 0:
                    # Lấy điểm cuối path hiện tại & điểm đầu segment mới
                    last_pt = full_path[-1]
                    first_seg = segment[0]
                    
                    gap_distance = haversine(
                        last_pt[0], last_pt[1],
                        first_seg[0], first_seg[1]
                    )
                    
                    # 🔧 QUAN TRỌNG: Xử lý gap
                    if gap_distance > 0.05:  # Gap > 50m
                        total_gaps += 1
                        route_logger.warning(
                            f"GAP_DETECTED | Route={route_id} Order={order} | "
                            f"Gap={gap_distance*1000:.0f}m | Station={name}"
                        )
                        # ✅ Thêm trạm làm điểm trung gian (nối gap)
                        full_path.append([lat, lng])
                    
                    if first_seg == [lat, lng]:           # Nếu segment[0] trùng trạm
                        segment = segment[1:]              # Bỏ segment[0]
                        
                    # ✅ Thêm segment (không bao gồm trạm lại lần nữa)
                    if segment:
                        full_path.extend(segment)
                        has_detailed_path = True
                        
                    
            except Exception as e:
                route_logger.warning(
                    f"PARSE_FAIL | Route={route_id} Order={order} | Station={name} | {str(e)}"
                )
                # Nếu parse fail → thêm trạm làm fallback
                if idx > 0:  # Không thêm start station lại
                    full_path.append([lat, lng])
        else:
            # Không có pathPoints → thêm tọa độ trạm
            if idx > 0:  # Không thêm start station lại
                full_path.append([lat, lng])
    
    # ========== ĐẢM BẢO END STATION ==========
    last_station = stations[-1]
    last_lat = last_station.get('Lat')
    last_lng = last_station.get('Lng')
    
    # Nếu điểm cuối KHÔNG phải tọa độ trạm cuối → thêm vào
    if full_path[-1] != [last_lat, last_lng]:
        dist_to_end = haversine(
            full_path[-1][0], full_path[-1][1],
            last_lat, last_lng
        )
        
        if dist_to_end > 0.001:  # > 1m
            full_path.append([last_lat, last_lng])
            route_logger.info(
                f"PATH_END | Route={route_id} | EndGap={dist_to_end*1000:.0f}m"
            )
    
    # ========== KIỂM TRA & RETURN ==========
    if has_detailed_path and len(full_path) > len(stations):
        route_logger.info(
            f"PATH_SUCCESS | Route={route_id} | Points={len(full_path)} | "
            f"Stations={len(stations)} | Gaps={total_gaps} | Source=DATABASE"
        )
        return full_path
    
    # FALLBACK OSRM
    route_logger.info(
        f"PATH_POOR | Route={route_id} | Calling OSRM... | Points={len(full_path)}"
    )
    
    try:
        station_coords = [[s['Lat'], s['Lng']] for s in stations]
        osrm_path = fetch_road_geometry_osrm(station_coords)
        
        if osrm_path and len(osrm_path) > 0:
            route_logger.info(
                f"OSRM_SUCCESS | Route={route_id} | Points={len(osrm_path)} | Source=OSRM"
            )
            return osrm_path
        else:
            return full_path
            
    except Exception as e:
        route_logger.error(f"OSRM_FAIL | Route={route_id} | {str(e)}")
        return full_path


# =========================================================
def get_route_no(route_id):
    try:
        # Check cache trước
        cached = cache_get(cache_key("route_no", route_id))
        if cached:
            return cached
        
        response = (
            supabase
            .table("routes")
            .select("RouteNo")
            .eq("RouteId", route_id)
            .single()
            .execute()
        )

        data = response.data
        result = str(data["RouteNo"]) if data else "Bus"
        
        # Cache 24h
        cache_set(cache_key("route_no", route_id), result, ttl=24*3600)
        return result
    except:
        return "Bus"


def get_route_name(route_id):
    try:
        # Check cache trước
        cached = cache_get(cache_key("route_name", route_id))
        if cached:
            return cached
        
        response = (
            supabase
            .table("routes")
            .select("RouteNo, RouteName")
            .eq("RouteId", route_id)
            .single()
            .execute()
        )

        data = response.data
        result = f"{data['RouteNo']} - {data['RouteName']}" if data else "Bus"
        
        # Cache 24h
        cache_set(cache_key("route_name", route_id), result, ttl=24*3600)
        return result
    
    except:
        return "Bus"


def validate_route_quality(route_id, direction):
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
        MAX_GAP_KM = 4       # Nếu 2 trạm liền kề cách nhau > 2.5km -> Loại
        
        # 1. Lấy danh sách trạm (FIX: dùng desc=False thay vì asc=True)
        # Lấy từ cache (instant! ~5-10ms)
        stations = get_stations_by_route(route_id, direction)
        
        count = len(stations)
        route_name = get_route_name(route_id)

        # 2. Kiểm tra số lượng trạm
        if count < MIN_STOPS:
            error_msg = f"Tuyến {route_name} quá ngắn: chỉ có {count} trạm"
            route_logger.warning(f"REJECTED_SHORT | RouteID={route_id} | {error_msg}")
            return (False, error_msg)

        # 3. Kiểm tra khoảng cách "nhảy cóc" (FIX: Ép kiểu float để tránh lỗi str-str)
        for i in range(count - 1):
            s1 = stations[i]
            s2 = stations[i+1]
            
            try:
                # ✅ Sửa lỗi str-str: Ép kiểu float và dùng .get() an toàn
                lat1 = float(s1.get('Lat', 0))
                lng1 = float(s1.get('Lng', 0))
                
                lat2 = float(s2.get('Lat', 0))
                lng2 = float(s2.get('Lng', 0))
                
                s1_name = s1.get('StationName', 'Unknown')
                s2_name = s2.get('StationName', 'Unknown')

                # Tính khoảng cách
                dist = haversine(lat1, lng1, lat2, lng2)
                
                if dist > MAX_GAP_KM:
                    error_msg = f"Phát hiện đứt quãng {dist:.2f}km giữa trạm '{s1_name}' và '{s2_name}'"
                    route_logger.warning(f"REJECTED_GAP | RouteID={route_id} | {error_msg}")
                    return (False, f"Tuyến {route_name} bị lỗi dữ liệu (ngắt quãng lớn)")
            except Exception as e:
                continue # Bỏ qua nếu dữ liệu lỗi
        
       
        # Đếm những stations có pathPoints
        has_path = sum(1 for s in stations if s.get('pathPoints')) 

        if has_path is not None and has_path < count * 0.3:
            route_logger.info(f"LOW_QUALITY_PATH | RouteID={route_id} | Chỉ {has_path}/{count} trạm có pathPoints")

        return (True, None)
        
    except Exception as e:
        route_logger.error(f"VALIDATE_ERROR | RouteID={route_id} Dir={direction} | {str(e)}")
        # Trả về True để không chặn user nếu code check lỗi (Fail-safe)
        return (True, None)
    
      
# =========================================================
# 3. THUẬT TOÁN TÌM ĐƯỜNG (REALISTIC SCORING)
# =========================================================
def find_smart_bus_route(start_coords, end_coords, skip_validation=False, **kwargs):
    """
    skip_validation=True: Bỏ qua validate, chỉ tìm bus có trạm gần, 
                          dùng OSRM vẽ đường, giữ tên bus
    """
    print(f"\n🔍 [REALISTIC MODE] Tìm từ {start_coords} -> {end_coords}")

    all_stops = bus_data.stations  # list of dict 

    # 🔥 [THÊM MỚI] Lấy danh sách ID tuyến sạch về 1 lần duy nhất
    active_route_ids = bus_data.active_route_ids
    print(f"ℹ️ Đã tải {len(active_route_ids)} tuyến đang hoạt động.")
    print(f"ℹ️ Tổng {len(all_stops)} trạm được cache.")
    
    # DANH SÁCH TUYẾN XƯƠNG SỐNG (Ưu tiên)
    BACKBONE_ROUTES = ['19', '53', '150', '8', '6', '56', '10', '30', '104', '33', '99', '152']
    
    route_no_cache = {}
    def is_backbone(rid):
        if rid not in route_no_cache:
            route_no_cache[rid] = get_route_no(rid)
        return route_no_cache[rid] in BACKBONE_ROUTES

     # ========== THÊM CACHE VALIDATION ==========
    route_quality_cache = {}
    def is_valid_route(rid, direction):
        """Kiểm tra tuyến có đủ tiêu chuẩn không"""
        key = (rid, direction)
        if key not in route_quality_cache:
            is_valid, error = validate_route_quality(rid, direction)
            route_quality_cache[key] = is_valid
            if not is_valid:
                print(f"❌ {error}")
        return route_quality_cache[key]
    # ==========================================
    
    def get_nearby_routes(coords, radius_km):
        nearby_stations = bus_data.find_nearby_stations(coords['lat'], coords['lon'], radius_km)
        
        routes = {}
        for stop in nearby_stations:
            
            # --- [FIX START] Ép kiểu RouteId về string để so sánh ---
            raw_id = stop.get('RouteId')
            if raw_id is None: continue # Bỏ qua nếu dữ liệu lỗi
            r_id = str(raw_id) 
            # --- [FIX END] ---

            direction = str(stop.get('StationDirection'))
            
            # Bây giờ so sánh String với Set of Strings mới đúng
            if r_id not in active_route_ids:
                # Debug log: in ra để biết tại sao bị loại (chỉ dùng khi test)
                # print(f"DEBUG: Loại Route {r_id} vì không active") 
                continue
            
            s_lat = stop.get('Lat')
            s_lng = stop.get('Lng')
            
            # Bỏ qua nếu dữ liệu lỗi
            if s_lat is None or s_lng is None: continue
                
            dist = haversine(coords['lat'], coords['lon'], s_lat, s_lng)
           
            if dist <= radius_km:
                direction = stop.get('StationDirection')
                key = (r_id, direction)
                
                # ========== THÊM CHECK Ở ĐÂY ==========
                if not is_valid_route(r_id, direction):
                    continue  # Bỏ qua tuyến không hợp lệ
                # ==========================================
                
                # Logic cũ giữ nguyên, chỉ đổi cách lấy dữ liệu
                if key not in routes or dist < routes[key]['dist']:
                    routes[key] = {
                        'StationId': stop.get('StationId'), 
                        'StationName': stop.get('StationName'), 
                        'Lat': s_lat, 
                        'Lng': s_lng,
                        'RouteId': r_id, 
                        'StationOrder': stop.get('StationOrder'), 
                        'StationDirection': direction,
                        'dist': dist
                    }
        return routes

    # 1. Tìm trạm (Quét rộng để bắt tuyến xương sống)
    s_close = get_nearby_routes(start_coords, 5.0)
    e_close = get_nearby_routes(end_coords, 5.0)

    if not e_close: e_close = get_nearby_routes(end_coords, 6.0)

    if not s_close or not e_close:
        # Nếu skip_validation → return OSRM + bus name
        if skip_validation:
            # Tìm bus nào có trạm gần nhất
            best_route = find_best_route_for_osrm(s_close, e_close)
            
            if best_route:
                return {
                    'success': True,
                    'count': 1,
                    'routes': [{
                        'route_name': f"Xe {get_route_name(best_route)}",
                        'description': f"Tuyến {get_route_name(best_route)} (vẽ OSRM)",
                        'type': 'bus_osrm',
                        'osrm_needed': True,  # Signal: cần gọi OSRM
                        'route_id': best_route,
                        'start_coords': start_coords,
                        'end_coords': end_coords
                    }]
                }
        return {
            'success': False, 
            'error': 'Không tìm thấy tuyến xe bus phù hợp (chỉ hiển thị tuyến thỏa yêu cầu). Vui lòng thử điểm khác hoặc mở rộng bán kính tìm kiếm.',
            'fallback': 'osrm',  # ← Signal cho frontend
            'start_coords': start_coords,
            'end_coords': end_coords
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
                
                trans_row = find_transfer_point(
                    s["RouteId"], 
                    s["StationDirection"], 
                    e["RouteId"], 
                    e["StationDirection"], 
                    s["StationOrder"], 
                    e["StationOrder"]
                )

                if trans_row:
                    trans = {
                        'StationName': trans_row["StationName"],
                        'Lat': trans_row["Lat"],
                        'Lng': trans_row["Lng"],
                        'Order1': trans_row["Order1"],
                        'Order2': trans_row["Order2"]
                    }
                    walk_total = s['dist'] + e['dist']

                    stops_total = (
                        (trans['Order1'] - s['StationOrder']) +
                        (e['StationOrder'] - trans['Order2'])
                    )
                    # Phạt nặng nếu tổng trạm > 70
                    penalty = 0
                    if stops_total > 70: penalty = 500

                    score = (
                        walk_total * WEIGHT_WALK +
                        stops_total * WEIGHT_STOP +
                        TRANSFER_PENALTY +
                        penalty
                    )

                    potential_solutions.append({
                        'type': 'transfer',
                        'score': score,
                        'walk': walk_total,
                        'stops': stops_total,
                        'data': (s, e, trans)
                    })
    # --- KẾT QUẢ ---
    if not potential_solutions:
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
    r_lbl = get_route_name( best['data'][0]['RouteId'])
    print(f"   🏆 Tốt nhất: {best['type'].upper()} ({r_lbl}) | Walk: {best['walk']:.2f}km | Score: {best['score']:.1f}")
    
    route_logger.info(
        f"FOUND | Type={best['type'].upper()} | Route={r_lbl} | "
        f"Walk={best['walk']:.2f}km | Stops={best['stops']} | Score={best['score']:.1f}"
    )
    
    # Build response cho từng option
    final_results = []
    for sol in top_solutions:
        if sol['type'] == 'direct':
            res = build_response( sol['data'][0], sol['data'][1], 'direct')
        else:
            res = build_response( sol['data'][0], sol['data'][1], 'transfer', sol['data'][2])
        
        if res['success']:
            final_results.append(res['data'])
    
 
    return {
        'success': True,
        'count': len(final_results),
        'routes': final_results  # ✅ Đổi key từ 'data' → 'routes' cho rõ ràng
    }


def find_best_route_for_osrm(s_close, e_close):
    """
    Tìm tuyến bus tốt nhất từ s_close và e_close
    Return: route_id của tuyến bus tốt nhất
    """
    # Tìm tuyến có ở cả start và end
    common_routes = s_close & e_close  # Intersection của 2 sets
    
    if common_routes:
        return list(common_routes)[0]  # Lấy tuyến đầu tiên
    
    # Nếu không có tuyến chung → lấy từ s_close
    if s_close:
        return list(s_close)[0]
    
    return None
# =========================================================

# Hàm helpers để tìm trạm giao nhau
def find_transfer_point(routeA, dirA, routeB, dirB, start_order, end_order):
    """
    Tìm trạm giao nhau giữa tuyến A và tuyến B.
    Logic tương đương SQL JOIN cũ.

    Trả về:
        {
            "StationName": ...,
            "Lat": ...,
            "Lng": ...,
            "Order1": ...,
            "Order2": ...
        }
    hoặc None nếu không tìm thấy.
    """

    # ==========================================
    # 1) Lấy danh sách S1 (các trạm từ tuyến A)
    # ==========================================
    try:
        # Lấy từ cache (instant! ~5-20ms)
        transfers = bus_data.get_transfer_stations(routeA, dirA, routeB, dirB)
        
        if not transfers:
            return None
        
        # Lấy transfer point đầu tiên (đã match điều kiện)
        transfer = transfers[0]
        
        # Filter theo order nếu cần
        if start_order <= transfer.get('Order1', 0) <= end_order:
            return {
                "StationName": transfer["StationName"],
                "Lat": transfer["Lat"],
                "Lng": transfer["Lng"],
                "Order1": transfer["Order1"],
                "Order2": transfer["Order2"],
            }
        
        return None
        
    except Exception as e:
        route_logger.error(f"TRANSFER_ERROR | {str(e)}")
        return None

def build_response( s, e, type, trans=None):
    """
    Xây dựng object JSON trả về cho Frontend.
    [CHANGE]: Không đóng connection ở đây để dùng cho vòng lặp.
    """
    if type == 'direct':
        name = get_route_name( s['RouteId'])
        path = get_official_path_from_db( s['RouteId'], s['StationDirection'], s['StationOrder'], e['StationOrder'])

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
        no1 = get_route_no(s['RouteId'])
        no2 = get_route_no(e['RouteId'])
        
        # 2. Lấy tên đầy đủ nếu cần hiển thị chi tiết
        name1 = get_route_name(s['RouteId'])
        name2 = get_route_name(e['RouteId'])
        
        path1 = get_official_path_from_db(s['RouteId'], s['StationDirection'], s['StationOrder'], trans['Order1'])
        path2 = get_official_path_from_db(e['RouteId'], e['StationDirection'], trans['Order2'], e['StationOrder'])
        
        return {
            'success': True,
            'type': 'transfer', 
            'data': {
                # [QUAN TRỌNG] Sửa route_name để hiển thị trên Header của Card
                'route_name': f"Xe {no1} ➝ Xe {no2}", 
                
                # [QUAN TRỌNG] Sửa description để hiển thị dòng chữ nhỏ bên dưới
                'description': f"Tuyến {no1} & {no2} - Đổi xe tại {trans['StationName']}", 
                
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
    