import requests
import math
import itertools
import os
import json
from time import sleep
from flask import Blueprint, request, jsonify
from typing import List, Dict, Tuple, Optional

# --- Import module tính tiền ---
try:
    from .cost_estimation import calculate_transport_cost
except ImportError:
    try:
        from cost_estimation import calculate_transport_cost
    except ImportError:
        raise ImportError("Cannot import cost_estimation module")

class AStarRouter:
    """
    Multi-Stop Trip Optimizer
    - Geocoding: Nominatim (OSM)
    - Routing: OSRM (OpenStreetMap Routing Machine)
    - TSP: Brute Force (Permutations) cho < 7 điểm
    - Cost: cost_estimation module
    """
    
    PROFILE_MAP = {
        'car': 'driving',
        'moto': 'bike',
        'bus': 'driving'
    }
    
    # Retry configuration
    MAX_RETRIES = 3
    RETRY_DELAY = 2
    
    def __init__(self, db_path=None):
        """
        db_path: Giữ lại tham số để tương thích, nhưng không dùng
        """
        self.osrm_base = "http://router.project-osrm.org/route/v1"
        self.nominatim_base = "https://nominatim.openstreetmap.org/search"
        self.headers = {
            'User-Agent': 'GOpamine-Student-App/1.0 (student-project)'
        }
        print("🚀 AStarRouter initialized (Mode: Nominatim + OSRM + TSP Brute Force)")

    def _retry_request(self, func, *args, **kwargs):
        """Helper: Thử lại request với exponential backoff"""
        for attempt in range(self.MAX_RETRIES):
            try:
                return func(*args, **kwargs)
            except requests.exceptions.RequestException as e:
                if attempt < self.MAX_RETRIES - 1:
                    wait_time = self.RETRY_DELAY * (2 ** attempt)
                    print(f"⚠️  Request failed (attempt {attempt + 1}/{self.MAX_RETRIES}), retrying in {wait_time}s...")
                    sleep(wait_time)
                else:
                    print(f"❌ Request failed after {self.MAX_RETRIES} attempts: {e}")
                    return None

    def get_place_by_id(self, place_identifier):
        """
        [HYBRID FIX] Chấp nhận cả Tọa độ (Dict) lẫn Tên (String).
        Nếu là Tên quá dài -> Tự động cắt ngắn để tìm cho ra.
        """
        # 1. ƯU TIÊN: Nếu input là Dict có tọa độ (Frontend gửi đúng) -> Dùng luôn
        if isinstance(place_identifier, dict) and 'lat' in place_identifier and 'lon' in place_identifier:
            return {
                'id': place_identifier.get('name', 'unknown'),
                'name': place_identifier.get('name', 'Unknown Place'),
                'lat': float(place_identifier['lat']),
                'lon': float(place_identifier['lon'])
            }

        # 2. XỬ LÝ STRING: Nếu input là Tên (Frontend gửi sai hoặc chưa chọn dropdown)
        if isinstance(place_identifier, int): return None
        
        try:
            # --- LOGIC CẮT CHUỖI THÔNG MINH ---
            query_name = str(place_identifier)
            
            # Mẹo: Nếu tên có dấu phẩy (VD: "Đại học A, Quận 1, TP.HCM"), chỉ lấy phần đầu tiên "Đại học A"
            if ',' in query_name:
                query_name = query_name.split(',')[0].strip()
            
            # Mẹo 2: Nếu sau khi cắt mà vẫn quá dài (> 10 từ), cắt tiếp lấy 6 từ đầu
            words = query_name.split()
            if len(words) > 10:
                query_name = ' '.join(words[:6])

            # Tạo query tìm kiếm
            query = f"{query_name}, Ho Chi Minh City" if "Ho Chi Minh" not in str(query_name) else query_name
            params = {'q': query, 'format': 'json', 'limit': 1}
            
            print(f"🔍 Đang tìm lại với từ khóa ngắn gọn: '{query}'") # In ra để debug
            
            def make_request():
                return requests.get(self.nominatim_base, params=params, headers=self.headers, timeout=5)
            
            resp = self._retry_request(make_request)
            if not resp: return None
            
            data = resp.json()
            if data and len(data) > 0:
                return {
                    'id': place_identifier, # Giữ nguyên ID gốc
                    'name': data[0]['display_name'].split(',')[0], # Lấy tên hiển thị ngắn gọn
                    'full_name': data[0]['display_name'],
                    'lat': float(data[0]['lat']),
                    'lon': float(data[0]['lon'])
                }
            
            print(f"⚠️ Vẫn không tìm thấy: {query}")
            return None
            
        except Exception as e:
            print(f"❌ Geocoding Error: {e}")
            return None

    # ==============================================================================
    # HELPER: DISTANCE & ROUTE
    # ==============================================================================

    def haversine_distance(self, lat1, lon1, lat2, lon2):
        """Tính khoảng cách đường chim bay (km)"""
        R = 6371
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    def get_real_route(self, start, end, waypoints=None, profile='driving'):
        """
        Lấy đường đi thực tế từ OSRM
        start, end: {lat, lon, name}
        waypoints: list các điểm trung gian
        Output: {coordinates, distance, duration, legs}
        """
        try:
            coords = [f"{start['lon']},{start['lat']}"]
            if waypoints:
                for wp in waypoints:
                    coords.append(f"{wp['lon']},{wp['lat']}")
            coords.append(f"{end['lon']},{end['lat']}")
            
            url = f"{self.osrm_base}/{profile}/{';'.join(coords)}"
            params = {'overview': 'full', 'geometries': 'geojson', 'steps': 'true'}
            
            def make_request():
                return requests.get(url, params=params, timeout=10)
            
            resp = self._retry_request(make_request)
            if not resp:
                return None
            
            data = resp.json()
            
            if data['code'] != 'Ok':
                print(f"⚠️  OSRM returned code: {data['code']}")
                return None
            
            route = data['routes'][0]
            return {
                'coordinates': route['geometry']['coordinates'],
                'distance': route['distance'] / 1000,  # Convert to km
                'duration': route['duration'] / 60,    # Convert to minutes
                'legs': route['legs']
            }
        except Exception as e:
            print(f"❌ OSRM Error: {e}")
            return None

    # ==============================================================================
    # CORE: TSP BRUTE FORCE
    # ==============================================================================

    def optimize_stop_order(self, start_place, destinations):
        """
        TSP Brute Force: Tìm thứ tự tối ưu (ngắn nhất)
        Dùng itertools.permutations để duyệt tất cả hoán vị
        
        Input:
          - start_place: {lat, lon, name}
          - destinations: [{lat, lon, name}, ...]
        Output: Danh sách destinations đã sắp xếp lại
        """
        if not destinations:
            return []
        if len(destinations) <= 1:
            return destinations

        best_order = destinations
        min_dist = float('inf')

        # Duyệt tất cả hoán vị
        for perm in itertools.permutations(destinations):
            d = 0
            # Khoảng cách Start -> điểm 1
            d += self.haversine_distance(start_place['lat'], start_place['lon'], 
                                       perm[0]['lat'], perm[0]['lon'])
            # Khoảng cách các điểm tiếp theo
            for i in range(len(perm) - 1):
                d += self.haversine_distance(perm[i]['lat'], perm[i]['lon'], 
                                           perm[i+1]['lat'], perm[i+1]['lon'])
            
            if d < min_dist:
                min_dist = d
                best_order = list(perm)
        
        return best_order

    def find_optimal_route(self, start_id, end_id, vehicle_type='car', vehicle_speed=None):
        """
        Tìm đường A -> B (2 điểm)
        Giữ lại hàm này để tương thích với logic cũ
        """
        start = self.get_place_by_id(start_id)
        end = self.get_place_by_id(end_id)
        
        if not start or not end:
            return {'success': False, 'error': 'Không tìm thấy địa điểm (Geocoding fail)'}

        profile = self.PROFILE_MAP.get(vehicle_type, 'driving')
        real_route = self.get_real_route(start, end, profile=profile)
        
        if not real_route:
            # Fallback Haversine
            dist = self.haversine_distance(start['lat'], start['lon'], end['lat'], end['lon'])
            duration = (dist / 30) * 60  # Giả sử 30 km/h trung bình
            return {
                'success': True,
                'data': {
                    'waypoints': [start, end],
                    'route_coordinates': [],
                    'distance_km': round(dist, 2),
                    'duration_min': round(duration, 0),
                    'total_waypoints': 2
                }
            }

        return {
            'success': True,
            'data': {
                'waypoints': [start, end],
                'route_coordinates': real_route['coordinates'],
                'distance_km': round(real_route['distance'], 2),
                'duration_min': round(real_route['duration'], 0),
                'total_waypoints': 2
            }
        }

    # ==============================================================================
    # MAIN: MULTI-STOP TRIP PLANNING
    # ==============================================================================

    def plan_multi_stop_trip(self, start_id, destination_ids, is_student=False, vehicle_type='car'):
        """
        Hàm chính: Lập kế hoạch lộ trình đa điểm
        
        Input:
          - start_id: Tên/ID điểm xuất phát (String)
          - destination_ids: Danh sách tên điểm đến (List[String])
          - is_student: Boolean (áp dụng giảm giá SV)
          - vehicle_type: 'car', 'moto', 'bus'
        
        Output:
          {
            'success': bool,
            'data': {
              'total_distance_km': float,
              'summary': [{id, name, total_cost, display_total}, ...],
              'segments': [{step, from_name, to_name, distance_km, geometry, prices}, ...],
              'optimized_order': [list of place names]
            } hoặc
            'error': str
          }
        """
        try:
            # 0. VALIDATE INPUT - Đảm bảo destination_ids là list
            if isinstance(destination_ids, str):
                destination_ids = [destination_ids]
            
            if not destination_ids or len(destination_ids) == 0:
                return {'success': False, 'error': 'Vui lòng chỉ định ít nhất 1 điểm đến'}
            
            print(f"📍 Bắt đầu plan trip: Start={start_id}, Destinations={destination_ids}")
            
            # 1. GEOCODING - Lấy tọa độ từ tên địa điểm
            start_place = self.get_place_by_id(start_id)
            if not start_place:
                return {'success': False, 'error': f'Không tìm thấy điểm đi: {start_id}'}

            dest_places = []
            for dest in destination_ids:
                p = self.get_place_by_id(dest)
                if p: 
                    dest_places.append(p)
                    print(f"✅ Geocoded: {dest} -> {p['name']}")
                else:
                    print(f"⚠️  Geocoding fail: {dest}")
                sleep(1)  # Nominatim rate-limit

            if not dest_places:
                return {'success': False, 'error': 'Không tìm thấy địa điểm đến nào hợp lệ'}
            
            print(f"📍 Total destinations geocoded: {len(dest_places)}")

            # 2. TSP - Tối ưu thứ tự
            ordered_destinations = self.optimize_stop_order(start_place, dest_places)
            full_route = [start_place] + ordered_destinations

            # 3. Danh sách hãng xe để so sánh
            comparison_options = [
                {"id": "grab_bike", "name": "GrabBike", "mode": "ride_hailing_bike", "brand": "Grab"},
                {"id": "be_bike", "name": "BeBike", "mode": "ride_hailing_bike", "brand": "Be"},
                {"id": "xanh_bike", "name": "XanhSM Bike", "mode": "ride_hailing_bike", "brand": "Xanh SM"},
                {"id": "grab_car", "name": "GrabCar", "mode": "ride_hailing_car_4", "brand": "Grab"},
                {"id": "be_car", "name": "BeCar", "mode": "ride_hailing_car_4", "brand": "Be"},
                {"id": "xanh_car", "name": "XanhSM Taxi", "mode": "ride_hailing_car_4", "brand": "Xanh SM"},
                {"id": "bus", "name": "Xe Buýt", "mode": "bus", "brand": None},
            ]

            totals = {opt['id']: 0 for opt in comparison_options}
            segments = []

            # 4. TÍNH TOÁN TỪNG CHẶNG (IMPORTANT: Phải lặp hết tất cả)
            for i in range(len(full_route) - 1):
                curr = full_route[i]
                nxt = full_route[i+1]
                
                print(f"🚗 Chặng {i + 1}: {curr['name']} -> {nxt['name']}")
                
                sleep(0.1)  # OSRM rate-limit
                
                # Lấy đường thực tế
                route_data = self.get_real_route(curr, nxt, profile=self.PROFILE_MAP.get(vehicle_type, 'driving'))
                
                if route_data:
                    dist_km = route_data['distance']
                    geometry = route_data['coordinates']
                    print(f"   ✅ OSRM: {dist_km:.2f} km")
                else:
                    # Fallback: Haversine + 30% padding (để tính được)
                    dist_km = self.haversine_distance(curr['lat'], curr['lon'], nxt['lat'], nxt['lon']) * 1.3
                    geometry = []
                    print(f"   ⚠️  Fallback Haversine: {dist_km:.2f} km")

                # Tính giá từng chặng cho mỗi phương tiện (CRITICAL!)
                segment_prices = {}
                for opt in comparison_options:
                    res = calculate_transport_cost(
                        mode=opt['mode'], 
                        distance_km=dist_km, 
                        is_student=is_student, 
                        brand_name=opt['brand']
                    )
                    val = res['value'] if isinstance(res, dict) else res
                    totals[opt['id']] += val  # ← CỘNG DỒN vào total
                    segment_prices[opt['id']] = {
                        "cost": val, 
                        "display": res.get('display', '0đ') if isinstance(res, dict) else f"{val}đ"
                    }
                    print(f"      {opt['name']}: +{val:,}đ (total now: {totals[opt['id']]:,}đ)")

                segments.append({
                    'step': i + 1,
                    'from_name': curr['name'],
                    'to_name': nxt['name'],
                    'distance_km': round(dist_km, 2),
                    'geometry': geometry,
                    'prices': segment_prices
                })
            
            print(f"\n💰 FINAL TOTALS:")
            # 5. TỔNG HỢP KẾT QUẢ
            summary = []
            for opt in comparison_options:
                print(f"   {opt['name']}: {totals[opt['id']]:,}đ")
                summary.append({
                    "id": opt['id'],
                    "name": opt['name'],
                    "total_cost": totals[opt['id']],
                    "display_total": f"{totals[opt['id']]:,}đ"
                })
            summary.sort(key=lambda x: x['total_cost'])
            
            total_dist = sum(s['distance_km'] for s in segments)
            print(f"\n✅ TRIP COMPLETED:")
            print(f"   Total distance: {total_dist:.2f} km")
            print(f"   Total segments: {len(segments)}")
            print(f"   Optimized order: {[p['name'] for p in full_route]}")

            return {
                'success': True,
                'data': {
                    'total_distance_km': total_dist,
                    'summary': summary,
                    'segments': segments,
                    'optimized_order': [p['name'] for p in full_route]
                }
            }

        except Exception as e:
            print(f"❌ Plan Trip Error: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}

# ==============================================================================
# BLUEPRINT FACTORY
# ==============================================================================
def create_api_blueprint(db_path=None):
    """
    Tạo Blueprint cho API routes
    db_path: Giữ lại để tương thích nhưng không dùng
    """
    router = AStarRouter(db_path=db_path)
    api_bp = Blueprint('astar_api', __name__, url_prefix='/api')

    @api_bp.route('/places', methods=['GET'])
    def get_places():
        """Deprecated - Dùng Nominatim thay SQLite"""
        return jsonify({'success': True, 'data': [], 'message': 'Deprecated: Use search by name'})

    @api_bp.route('/find-route', methods=['POST'])
    def find_route():
        """2-point routing (Find optimal route from start to end)"""
        data = request.get_json()
        s = data.get('start_id') or data.get('start')
        e = data.get('end_id') or data.get('end')
        
        res = router.find_optimal_route(s, e, data.get('vehicle_type', 'car'))
        return jsonify(res)

    @api_bp.route('/plan-trip', methods=['POST'])
    def plan_trip():
        """Multi-stop routing (Plan trip with multiple stops)"""
        data = request.get_json()
        
        # [SỬA LẠI] Ưu tiên lấy object 'start' chứa tọa độ
        start_input = data.get('start') or data.get('start_id') or data.get('start_name')
        
        res = router.plan_multi_stop_trip(
            start_id=start_input, # Truyền start_input (có thể là dict hoặc string)
            destination_ids=data.get('destinations') or data.get('stops', []),
            is_student=data.get('is_student', False),
            vehicle_type=data.get('vehicle_type', 'car')
        )
        return jsonify(res)

    return api_bp