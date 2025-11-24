import requests
import math
import sqlite3
from typing import List, Dict, Tuple, Optional
import json

class AStarRouter:
    """
    Tìm đường đi tối ưu sử dụng A* kết hợp OSRM để lấy đường đi thực tế
    """
    
    PROFILE_MAP = {
        'car': 'driving',
        'moto': 'bike',
        'bus': 'driving'
    }
    
    def __init__(self, db_path=r'D:\PROJECT\rec_trans\Group4-Rec-Trans\GOpamine\backend\data\tourism-landmarks.db'):
        self.osrm_base = "http://router.project-osrm.org/route/v1"
        self.db_path = db_path
        
    # ========== DATABASE ==========
    
    def get_db_connection(self):
        """Kết nối đến database"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def get_all_places(self):
        """Lấy tất cả địa điểm từ database"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            # SỬA LẠI query này theo cấu trúc DB thực tế của bạn
            # Giả sử table tên là 'landmarks' với columns: id, name, latitude, longitude
            cursor.execute("""
                SELECT id, name, latitude as lat, longitude as lon 
                FROM locations
            """)
            
            places = []
            for row in cursor.fetchall():
                lat_str = str(row['lat']).replace(',', '.')
                lon_str = str(row['lon']).replace(',', '.')
                
                places.append({
                    'id': row['id'],
                    'name': row['name'],
                    'lat': float(lat_str),
                    'lon': float(lon_str)
                })
                
            conn.close()
            return places
        
        except Exception as e:
            print(f"Database Error: {e}")
            return self._get_sample_places()
    
    def _get_sample_places(self):
        """Dữ liệu mẫu nếu DB chưa có hoặc lỗi"""
        return [
            {"id": 1, "name": "Bến Thành Market", "lat": 10.7727, "lon": 106.6980},
            {"id": 2, "name": "Nhà Thờ Đức Bà", "lat": 10.7797, "lon": 106.6991},
            {"id": 3, "name": "Bưu Điện Trung Tâm", "lat": 10.7798, "lon": 106.6997},
            {"id": 4, "name": "Dinh Độc Lập", "lat": 10.7769, "lon": 106.6955},
            {"id": 5, "name": "Chợ Bình Tây", "lat": 10.7502, "lon": 106.6392},
            {"id": 6, "name": "Phố Đi Bộ Nguyễn Huệ", "lat": 10.7743, "lon": 106.7011},
            {"id": 7, "name": "Bitexco Tower", "lat": 10.7716, "lon": 106.7039},
            {"id": 8, "name": "Thảo Cầm Viên", "lat": 10.7878, "lon": 106.7057},
            {"id": 9, "name": "Bảo Tàng Chứng Tích Chiến Tranh", "lat": 10.7796, "lon": 106.6919},
            {"id": 10, "name": "Bến Nhà Rồng", "lat": 10.7675, "lon": 106.7073},
            {"id": 11, "name": "Chợ Ăn Đông", "lat": 10.7535, "lon": 106.6680},
            {"id": 12, "name": "Chợ Tân Định", "lat": 10.7889, "lon": 106.6917},
            {"id": 13, "name": "Làng Du Lịch Bình Quới", "lat": 10.8042, "lon": 106.7429},
            {"id": 14, "name": "Công Viên Lê Văn Tám", "lat": 10.7830, "lon": 106.6872},
            {"id": 15, "name": "Chợ Bà Chiểu", "lat": 10.8119, "lon": 106.6954},
            {"id": 16, "name": "Vincom Center", "lat": 10.7828, "lon": 106.7005},
            {"id": 17, "name": "Đầm Sen Park", "lat": 10.7649, "lon": 106.6376},
            {"id": 18, "name": "Phố Tây Bùi Viện", "lat": 10.7666, "lon": 106.6925},
            {"id": 19, "name": "TTTM Saigon Centre", "lat": 10.7822, "lon": 106.7016},
            {"id": 20, "name": "Chùa Vĩnh Nghiêm", "lat": 10.7995, "lon": 106.6804}
        ]
    
    def get_place_by_id(self, place_id: int):
        """Lấy thông tin 1 địa điểm theo ID"""
        places = self.get_all_places()
        return next((p for p in places if p['id'] == place_id), None)
    
    # ========== A* ALGORITHM ==========
    
    def haversine_distance(self, lat1: float, lon1: float, 
                          lat2: float, lon2: float) -> float:
        """Tính khoảng cách Haversine giữa 2 điểm (km)"""
        R = 6371
        
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        
        a = (math.sin(dlat / 2) ** 2 + 
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
             math.sin(dlon / 2) ** 2)
        
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def a_star_pathfinding(self, start: Dict, goal: Dict, 
                          all_places: List[Dict]) -> Optional[List[Dict]]:
        """
        Thuật toán A* tìm đường đi qua các điểm trung gian tối ưu
        """
        open_set = {start['id']}
        came_from = {}
        
        g_score = {place['id']: float('inf') for place in all_places}
        g_score[start['id']] = 0
        
        f_score = {place['id']: float('inf') for place in all_places}
        f_score[start['id']] = self.haversine_distance(
            start['lat'], start['lon'], goal['lat'], goal['lon']
        )
        
        while open_set:
            current_id = min(open_set, key=lambda x: f_score[x])
            current = next(p for p in all_places if p['id'] == current_id)
            
            if current_id == goal['id']:
                return self._reconstruct_path(came_from, current, all_places)
            
            open_set.remove(current_id)
            
            for neighbor in all_places:
                if neighbor['id'] == current_id:
                    continue
                
                distance = self.haversine_distance(
                    current['lat'], current['lon'],
                    neighbor['lat'], neighbor['lon']
                )
                tentative_g = g_score[current_id] + distance
                
                if tentative_g < g_score[neighbor['id']]:
                    came_from[neighbor['id']] = current_id
                    g_score[neighbor['id']] = tentative_g
                    f_score[neighbor['id']] = tentative_g + self.haversine_distance(
                        neighbor['lat'], neighbor['lon'],
                        goal['lat'], goal['lon']
                    )
                    open_set.add(neighbor['id'])
        
        return None
    
    def _reconstruct_path(self, came_from: Dict, current: Dict, 
                         all_places: List[Dict]) -> List[Dict]:
        """Tái tạo đường đi từ came_from map"""
        path = [current]
        
        while current['id'] in came_from:
            current_id = came_from[current['id']]
            current = next(p for p in all_places if p['id'] == current_id)
            path.insert(0, current)
        
        return path
    
    # ========== OSRM API ==========
    
    def get_real_route(self, start: Dict, end: Dict, 
                       waypoints: Optional[List[Dict]] = None,
                       profile: str = 'driving') -> Optional[Dict]:
        """
        Lấy đường đi thực tế từ OSRM API
        """
        try:
            coords = [f"{start['lon']},{start['lat']}"]
            
            if waypoints:
                for wp in waypoints:
                    coords.append(f"{wp['lon']},{wp['lat']}")
            
            coords.append(f"{end['lon']},{end['lat']}")
            
            url = f"{self.osrm_base}/{profile}/{';'.join(coords)}"
            params = {
                'overview': 'full',
                'geometries': 'geojson',
                'steps': 'true'
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            if data['code'] != 'Ok':
                return None
            
            route = data['routes'][0]
            
            return {
                'coordinates': route['geometry']['coordinates'],
                'distance': route['distance'] / 1000,
                'duration': route['duration'] / 60,
                'legs': route['legs']
            }
            
        except Exception as e:
            print(f"Error getting route from OSRM: {e}")
            return None
    
    # ========== MAIN FUNCTION ==========
    
    def find_optimal_route(self, start_id: int, end_id: int,
                           vehicle_type: str = 'car',
                           vehicle_speed: Optional[float] = None) -> Optional[Dict]:
        """
        Hàm chính: Tìm đường đi tối ưu từ start_id đến end_id
        
        Returns:
            {
                'success': True/False,
                'data': {
                    'waypoints': [...],
                    'route_coordinates': [[lon, lat], ...],
                    'distance_km': 5.2,
                    'duration_min': 15,
                    'total_waypoints': 3
                },
                'error': 'message' (nếu có lỗi)
            }
        """
        try:
            # Validate
            if start_id == end_id:
                return {
                    'success': False,
                    'error': 'Start and end points cannot be the same'
                }
            
            # Lấy tất cả địa điểm
            all_places = self.get_all_places()
            
            # Tìm start và end
            start = next((p for p in all_places if p['id'] == start_id), None)
            end = next((p for p in all_places if p['id'] == end_id), None)
            
            if not start or not end:
                return {
                    'success': False,
                    'error': 'Invalid place ID'
                }
            
            # Chạy A* tìm waypoints
            waypoints = self.a_star_pathfinding(start, end, all_places)
            
            if not waypoints or len(waypoints) < 2:
                return {
                    'success': False,
                    'error': 'No route found'
                }
            
            osrm_profile = self.PROFILE_MAP.get(vehicle_type, 'driving')
            
            # Lấy đường đi thực tế từ OSRM
            if len(waypoints) <= 10:
                real_route = self.get_real_route(
                    waypoints[0], 
                    waypoints[-1], 
                    waypoints[1:-1] if len(waypoints) > 2 else None,
                    profile=osrm_profile
                )
            else:
                real_route = self.get_real_route(
                    waypoints[0], 
                    waypoints[-1],
                    profile=osrm_profile
                )
            
            if not real_route:
                return {
                    'success': False,
                    'error': 'Cannot get real route from OSRM'
                }
            
            duration_min = round(real_route['duration'], 0)
            if vehicle_speed:
                try:
                    duration_min = round(
                        (real_route['distance'] / vehicle_speed) * 60,
                        0
                    )
                except ZeroDivisionError:
                    pass
            
            return {
                'success': True,
                'data': {
                    'waypoints': waypoints,
                    'route_coordinates': real_route['coordinates'],
                    'distance_km': round(real_route['distance'], 2),
                    'duration_min': duration_min,
                    'total_waypoints': len(waypoints),
                    'vehicle_type': vehicle_type,
                    'osrm_profile': osrm_profile
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }


# ========== TESTING ==========
if __name__ == "__main__":
    router = AStarRouter()
    
    # Test lấy địa điểm
    places = router.get_all_places()
    print(f"✅ Loaded {len(places)} places")
    
    # Test tìm đường
    result = router.find_optimal_route(1, 5)
    
    if result['success']:
        data = result['data']
        print(f"\n✅ Route found!")
        print(f"📏 Distance: {data['distance_km']} km")
        print(f"⏱️  Duration: {data['duration_min']} min")
        print(f"📍 Waypoints: {data['total_waypoints']}")
    else:
        print(f"\n❌ Error: {result['error']}")