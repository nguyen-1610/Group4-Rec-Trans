"""
BUS DATA MANAGER - Quản lý dữ liệu bus với cache tự động
Features:
  - Singleton pattern (một instance toàn bộ ứng dụng)
  - Cache warming + refresh lịch
  - KDTree spatial index (tìm trạm gần nhất cực nhanh)
  - Automatic retry & error handling
"""

import time
import math
import logging
import threading
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta

try:
    from scipy.spatial import cKDTree
    import numpy as np
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False

from backend.utils.cache_layer import cache, cache_key, cache_get, cache_set
from backend.utils.config import CACHE_CONFIG, DATA_CONFIG, SUPABASE_CONFIG

# Import Supabase (giả sử đã setup)
try:
    from backend.database.supabase_client import supabase
    SUPABASE_AVAILABLE = True
except:
    SUPABASE_AVAILABLE = False

logger = logging.getLogger('bus_manager')


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Tính khoảng cách giữa 2 điểm GPS (km)"""
    R = 6371  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


class BusDataManager:
    """
    Singleton manager cho dữ liệu bus
    
    Main responsibilities:
    1. Load dữ liệu từ Supabase → Cache (startup)
    2. Quản lý KDTree để tìm trạm gần nhất
    3. Cung cấp API truy cập dữ liệu từ cache
    4. Auto-refresh dữ liệu theo lịch
    5. Monitor cache health
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._initialized = True
        self.is_loading = False
        
        # In-memory state (cho KDTree)
        self.stations = []
        self.stations_by_route = {}
        self.kd_tree = None
        self.station_coords = None
        self.active_route_ids = set()
        
        # Metadata
        self.last_refresh_time = None
        self.data_version = 0
        
        # Lock cho thread-safe operations
        self.data_lock = threading.RLock()
        
        # Khởi tạo dữ liệu
        self.refresh_data()
        
        # Start auto-refresh thread (nếu enabled)
        if CACHE_CONFIG["AUTO_REFRESH"]:
            self._start_auto_refresh()
        
        logger.info("✅ BusDataManager initialized")
    
    @classmethod
    def get_instance(cls):
        """Factory method để lấy singleton instance"""
        return cls()
    
    def refresh_data(self, force: bool = False):
        """
        Load/reload dữ liệu từ Supabase → Cache
        
        Args:
            force: Nếu True, sẽ clear cache cũ trước khi load lại
        """
        if self.is_loading and not force:
            logger.warning("⚠️ Data loading already in progress, skipping...")
            return
        
        self.is_loading = True
        start_time = time.time()
        
        try:
            if force:
                cache.clear_all()
                logger.info("🔄 Cache cleared (force refresh)")
            
            logger.info("🔄 Loading bus data into cache...")
            
            # ========== STEP 1: Load Active Routes ==========
            self._load_active_routes()
            
            # ========== STEP 2: Load Stations ==========
            self._load_stations()
            
            # ========== STEP 3: Build KDTree Index ==========
            self._build_kdtree()
            
            elapsed = time.time() - start_time
            self.last_refresh_time = datetime.now()
            self.data_version += 1
            
            logger.info(
                f"✅ Data refresh completed in {elapsed:.2f}s | "
                f"Stations: {len(self.stations)} | Routes: {len(self.active_route_ids)} | "
                f"Version: {self.data_version}"
            )
            
        except Exception as e:
            logger.error(f"❌ Data refresh failed: {e}", exc_info=True)
        finally:
            self.is_loading = False
    
    def _load_active_routes(self):
        """Load các tuyến đang hoạt động"""
        try:
            if not SUPABASE_AVAILABLE:
                logger.warning("⚠️ Supabase not available, skipping route load")
                return
            
            resp = supabase.table("routes").select("RouteId").eq("IsActive", 1).execute()
            self.active_route_ids = {str(r['RouteId']) for r in resp.data or []}
            
            # Cache vào cache layer
            cache_set(
                cache_key("routes", "active_ids"),
                list(self.active_route_ids),
                ttl=CACHE_CONFIG["TTL"]["routes"]
            )
            
            logger.info(f"✅ Loaded {len(self.active_route_ids)} active routes")
            
        except Exception as e:
            logger.error(f"Error loading routes: {e}")
    
    def _load_stations(self):
        """Load tất cả trạm (chỉ những tuyến active)"""
        try:
            if not SUPABASE_AVAILABLE:
                logger.warning("⚠️ Supabase not available, skipping station load")
                return
            
            # Load từ Supabase với batch (nếu dữ liệu lớn)
            all_stations = []
            offset = 0
            batch_size = SUPABASE_CONFIG["BATCH_SIZE"]
            
            while True:
                resp = supabase.table("stations").select(
                    "StationId, StationName, Lat, Lng, RouteId, StationOrder, StationDirection, pathPoints"
                ).range(offset, offset + batch_size - 1).execute()
                
                batch = resp.data or []
                if not batch:
                    break
                
                all_stations.extend(batch)
                offset += batch_size
                logger.debug(f"Loaded batch: {len(batch)} stations (total: {len(all_stations)})")
            
            # Process stations
            temp_coords = []
            valid_stations = []
            self.stations_by_route = {}
            
            with self.data_lock:
                for s in all_stations:
                    # Skip trạm thuộc tuyến không active
                    if str(s['RouteId']) not in self.active_route_ids:
                        continue
                    
                    # Validate coordinates
                    if not (s.get('Lat') and s.get('Lng')):
                        logger.warning(f"Invalid coordinates for station {s.get('StationId')}")
                        continue
                    
                    # Group by (RouteId, Direction)
                    route_id = str(s['RouteId'])
                    direction = str(s.get('StationDirection', '1'))
                    key = (route_id, direction)
                    
                    if key not in self.stations_by_route:
                        self.stations_by_route[key] = []
                    
                    self.stations_by_route[key].append(s)
                    
                    # Prep for KDTree
                    temp_coords.append([s['Lat'], s['Lng']])
                    valid_stations.append(s)
                    
                    # Cache individual station
                    cache_set(
                        cache_key("station", s['StationId']),
                        s,
                        ttl=CACHE_CONFIG["TTL"]["stations"]
                    )
                
                # Sort stations by order
                for k in self.stations_by_route:
                    self.stations_by_route[k].sort(key=lambda x: x.get('StationOrder', 0))
                
                self.stations = valid_stations
            
            logger.info(f"✅ Loaded {len(valid_stations)} valid stations")
            
        except Exception as e:
            logger.error(f"Error loading stations: {e}")
    
    def _build_kdtree(self):
        """Build KDTree spatial index cho tìm kiếm nhanh"""
        try:
            if not SCIPY_AVAILABLE or not self.stations:
                logger.warning("⚠️ Scipy not available or no stations, skipping KDTree build")
                return
            
            with self.data_lock:
                coords = np.array([[s['Lat'], s['Lng']] for s in self.stations])
                self.station_coords = coords
                self.kd_tree = cKDTree(coords)
            
            logger.info(f"✅ KDTree built for {len(self.stations)} stations")
            
        except Exception as e:
            logger.error(f"Error building KDTree: {e}")
    
    def find_nearby_stations(self, lat: float, lng: float, radius_km: float = 1.0) -> List[Dict]:
        """
        Tìm các trạm gần nhất (sử dụng KDTree - O(log n))
        
        Args:
            lat: Latitude
            lng: Longitude
            radius_km: Bán kính tìm kiếm (km)
        
        Returns:
            List of stations with 'dist' field
        """
        # Check cache trước
        cache_key_str = cache_key("nearby_stations", f"{lat:.4f}", f"{lng:.4f}", f"{radius_km}")
        cached = cache_get(cache_key_str)
        if cached is not None:
            return cached
        
        try:
            if not self.kd_tree or not SCIPY_AVAILABLE:
                logger.warning("KDTree not available, falling back to linear search")
                return self._find_nearby_linear(lat, lng, radius_km)
            
            with self.data_lock:
                # Convert km to degrees (~111 km per degree)
                radius_deg = radius_km / 111.0
                
                # Query KDTree
                indices = self.kd_tree.query_ball_point([lat, lng], r=radius_deg)
                
                results = []
                for i in indices:
                    s = self.stations[i].copy()
                    dist = haversine(lat, lng, s['Lat'], s['Lng'])
                    if dist <= radius_km:
                        s['dist'] = round(dist, 3)
                        results.append(s)
                
                # Sort by distance
                results.sort(key=lambda x: x['dist'])
        
        except Exception as e:
            logger.error(f"Error finding nearby stations: {e}")
            results = []
        
        # Cache kết quả
        cache_set(cache_key_str, results, ttl=CACHE_CONFIG["TTL"]["nearby_stations"])
        return results
    
    def _find_nearby_linear(self, lat: float, lng: float, radius_km: float) -> List[Dict]:
        """Fallback: Linear search (khi KDTree không sẵn có)"""
        results = []
        with self.data_lock:
            for s in self.stations:
                dist = haversine(lat, lng, s['Lat'], s['Lng'])
                if dist <= radius_km:
                    s_copy = s.copy()
                    s_copy['dist'] = round(dist, 3)
                    results.append(s_copy)
        
        results.sort(key=lambda x: x['dist'])
        return results
    
    def get_stations_by_route(self, route_id: str, direction: str = "1") -> List[Dict]:
        """
        Lấy danh sách trạm của một tuyến + hướng
        
        Returns:
            List of stations, đã sort by StationOrder
        """
        cache_key_str = cache_key("route_stations", route_id, direction)
        cached = cache_get(cache_key_str)
        if cached is not None:
            return cached
        
        with self.data_lock:
            result = self.stations_by_route.get((str(route_id), str(direction)), [])
        
        # Cache kết quả
        cache_set(cache_key_str, result, ttl=CACHE_CONFIG["TTL"]["stations"])
        return result
    
    def get_station_by_id(self, station_id: str) -> Optional[Dict]:
        """Lấy thông tin 1 trạm theo ID"""
        # Check cache trước
        cached = cache_get(cache_key("station", station_id))
        if cached:
            return cached
        
        # Nếu không có → search trong memory
        with self.data_lock:
            for s in self.stations:
                if str(s['StationId']) == str(station_id):
                    cache_set(cache_key("station", station_id), s, ttl=CACHE_CONFIG["TTL"]["stations"])
                    return s
        
        return None
    
    def get_transfer_stations(self, route1: str, dir1: str, route2: str, dir2: str) -> List[Dict]:
        """
        Tìm các trạm giao nhau giữa 2 tuyến
        
        Returns:
            List of transfer stations (StationName, Lat, Lng, Order1, Order2, ...)
        """
        cache_key_str = cache_key("transfer_points", route1, dir1, route2, dir2)
        cached = cache_get(cache_key_str)
        if cached:
            return cached
        
        stations1 = self.get_stations_by_route(route1, dir1)
        stations2 = self.get_stations_by_route(route2, dir2)
        
        transfer_points = []
        
        for s1 in stations1:
            for s2 in stations2:
                # Điều kiện: gần nhau + tên giống (hoặc cặp)
                close_position = (
                    abs(s1.get('Lat', 0) - s2.get('Lat', 0)) < 0.005 and
                    abs(s1.get('Lng', 0) - s2.get('Lng', 0)) < 0.005
                )
                same_name = s1.get('StationName') == s2.get('StationName')
                
                if close_position or same_name:
                    transfer_points.append({
                        'StationName': s1.get('StationName'),
                        'Lat': s1.get('Lat'),
                        'Lng': s1.get('Lng'),
                        'Order1': s1.get('StationOrder'),
                        'Order2': s2.get('StationOrder'),
                        'StationId': s1.get('StationId'),
                    })
                    break  # Tìm được 1 → qua trạm tiếp theo
        
        # Cache kết quả
        cache_set(cache_key_str, transfer_points, ttl=CACHE_CONFIG["TTL"]["transfer_points"])
        return transfer_points
    
    def get_stats(self) -> Dict:
        """Trả về statistics"""
        with self.data_lock:
            return {
                "total_stations": len(self.stations),
                "total_routes": len(self.active_route_ids),
                "stations_by_route_count": len(self.stations_by_route),
                "kd_tree_ready": self.kd_tree is not None,
                "last_refresh": self.last_refresh_time,
                "data_version": self.data_version,
                "cache_stats": cache.get_stats(),
            }
    
    def _start_auto_refresh(self):
        """Start background thread cho auto-refresh theo lịch"""
        def auto_refresh_worker():
            while True:
                try:
                    # Tính thời gian đến lần refresh tiếp theo
                    now = datetime.now()
                    refresh_time_str = CACHE_CONFIG["REFRESH_TIME"]  # e.g., "02:00"
                    hour, minute = map(int, refresh_time_str.split(':'))
                    
                    next_refresh = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    if next_refresh <= now:
                        next_refresh += timedelta(days=1)
                    
                    sleep_seconds = (next_refresh - now).total_seconds()
                    logger.info(f"Next auto-refresh scheduled at {next_refresh} ({sleep_seconds:.0f}s)")
                    
                    time.sleep(sleep_seconds)
                    logger.info("⏰ Auto-refresh triggered")
                    self.refresh_data(force=True)
                    
                except Exception as e:
                    logger.error(f"Auto-refresh error: {e}")
                    time.sleep(3600)  # Retry sau 1h
        
        thread = threading.Thread(target=auto_refresh_worker, daemon=True)
        thread.start()
        logger.info("✅ Auto-refresh worker started")


# ==================== GLOBAL INSTANCE ====================
bus_data = BusDataManager.get_instance()


# ==================== CONVENIENCE FUNCTIONS ====================
def find_nearby_stations(lat: float, lng: float, radius_km: float = 1.0) -> List[Dict]:
    """Tìm trạm gần nhất"""
    return bus_data.find_nearby_stations(lat, lng, radius_km)


def get_stations_by_route(route_id: str, direction: str = "1") -> List[Dict]:
    """Lấy trạm của tuyến"""
    return bus_data.get_stations_by_route(route_id, direction)


def get_transfer_stations(route1: str, dir1: str, route2: str, dir2: str) -> List[Dict]:
    """Tìm trạm giao nhau"""
    return bus_data.get_transfer_stations(route1, dir1, route2, dir2)


def get_bus_data_stats() -> Dict:
    """Lấy thống kê"""
    return bus_data.get_stats()


if __name__ == "__main__":
    # Test
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(name)s] %(message)s'
    )
    
    # Get instance
    manager = BusDataManager.get_instance()
    
    # Test queries
    print("Stats:", manager.get_stats())
    print("Nearby:", manager.find_nearby_stations(10.7769, 106.7009, 1.0))