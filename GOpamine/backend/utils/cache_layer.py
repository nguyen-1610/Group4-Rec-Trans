"""
CACHE LAYER - Tầng cache toàn diện cho Bus Routing
Features:
  - Dual cache: Redis + In-Memory (fallback)
  - Automatic TTL management
  - Cache warming & refresh
  - Metadata tracking
  - Health monitoring
"""

import json
import time
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
import threading

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

from backend.utils.config import CACHE_CONFIG

logger = logging.getLogger('cache_layer')


class CacheMetadata:
    """Theo dõi metadata của cache (kích thước, hit rate, v.v.)"""
    def __init__(self):
        self.hits = 0
        self.misses = 0
        self.total_size_bytes = 0
        self.last_refresh = None
        self.keys_count = {}
        
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return (self.hits / total * 100) if total > 0 else 0
    
    def get_stats(self) -> Dict:
        return {
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": f"{self.hit_rate():.1f}%",
            "total_size_mb": round(self.total_size_bytes / 1024 / 1024, 2),
            "last_refresh": self.last_refresh,
            "keys_count": self.keys_count,
        }


class MemoryCache:
    """In-memory cache (fallback hoặc primary nếu không dùng Redis)"""
    def __init__(self):
        self.storage = {}
        self.ttl = {}
        self.lock = threading.RLock()
    
    def set(self, key: str, value: Any, ttl: int = 3600):
        with self.lock:
            self.storage[key] = value
            self.ttl[key] = time.time() + ttl
    
    def get(self, key: str) -> Optional[Any]:
        with self.lock:
            if key not in self.storage:
                return None
            
            # Check TTL
            if time.time() > self.ttl.get(key, 0):
                del self.storage[key]
                if key in self.ttl:
                    del self.ttl[key]
                return None
            
            return self.storage[key]
    
    def delete(self, key: str):
        with self.lock:
            self.storage.pop(key, None)
            self.ttl.pop(key, None)
    
    def exists(self, key: str) -> bool:
        return self.get(key) is not None
    
    def clear(self):
        with self.lock:
            self.storage.clear()
            self.ttl.clear()
    
    def size_mb(self) -> float:
        return sum(len(str(v).encode()) for v in self.storage.values()) / 1024 / 1024


class CacheLayer:
    """
    Tầng cache toàn diện - Quản lý cả Redis + In-Memory
    """
    
    def __init__(self):
        self.redis_client = None
        self.memory_cache = MemoryCache()
        self.metadata = CacheMetadata()
        self.cache_ready = False
        
        # Khởi tạo Redis (nếu enabled)
        if CACHE_CONFIG["USE_REDIS"] and REDIS_AVAILABLE:
            self._init_redis()
        
        logger.info("✅ Cache Layer initialized")
    
    def _init_redis(self):
        """Khởi tạo Redis connection"""
        try:
            self.redis_client = redis.from_url(
                CACHE_CONFIG["REDIS_URL"],
                decode_responses=True,
                socket_connect_timeout=CACHE_CONFIG["REDIS_TIMEOUT"]
            )
            self.redis_client.ping()
            logger.info("✅ Redis connected successfully")
        except Exception as e:
            logger.warning(f"⚠️ Redis connection failed: {e}. Falling back to memory cache.")
            self.redis_client = None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """
        Lưu value vào cache (cả Redis và Memory)
        """
        if ttl is None:
            ttl = CACHE_CONFIG["TTL"].get("default", 3600)
        
        try:
            # 1. Lưu vào memory (luôn)
            self.memory_cache.set(key, value, ttl)
            
            # 2. Lưu vào Redis (nếu có)
            if self.redis_client:
                try:
                    json_val = json.dumps(value) if not isinstance(value, str) else value
                    self.redis_client.setex(key, ttl, json_val)
                except Exception as e:
                    logger.warning(f"Redis SET failed for key {key}: {e}")
            
            self.metadata.total_size_bytes = self.memory_cache.size_mb() * 1024 * 1024
            return True
            
        except Exception as e:
            logger.error(f"Cache SET error for key {key}: {e}")
            return False
    
    def get(self, key: str) -> Optional[Any]:
        """
        Lấy value từ cache (priority: Redis → Memory)
        """
        try:
            # 1. Thử lấy từ Redis trước (nhanh hơn)
            if self.redis_client:
                try:
                    val = self.redis_client.get(key)
                    if val:
                        self.metadata.hits += 1
                        try:
                            return json.loads(val)
                        except:
                            return val
                except Exception as e:
                    logger.warning(f"Redis GET failed for key {key}: {e}")
            
            # 2. Lấy từ Memory cache
            val = self.memory_cache.get(key)
            if val:
                self.metadata.hits += 1
                return val
            
            # 3. Miss
            self.metadata.misses += 1
            return None
            
        except Exception as e:
            logger.error(f"Cache GET error for key {key}: {e}")
            self.metadata.misses += 1
            return None
    
    def delete(self, key: str) -> bool:
        """Xóa key khỏi cache"""
        try:
            self.memory_cache.delete(key)
            if self.redis_client:
                try:
                    self.redis_client.delete(key)
                except:
                    pass
            return True
        except Exception as e:
            logger.error(f"Cache DELETE error for key {key}: {e}")
            return False
    
    def exists(self, key: str) -> bool:
        """Kiểm tra key có tồn tại"""
        return self.get(key) is not None
    
    def clear_all(self) -> bool:
        """Xóa toàn bộ cache"""
        try:
            self.memory_cache.clear()
            if self.redis_client:
                try:
                    self.redis_client.flushdb()
                except:
                    pass
            logger.info("✅ Cache cleared")
            return True
        except Exception as e:
            logger.error(f"Cache CLEAR error: {e}")
            return False
    
    def get_stats(self) -> Dict:
        """Trả về thống kê cache"""
        return {
            "redis_connected": self.redis_client is not None,
            "memory_usage_mb": self.memory_cache.size_mb(),
            "metadata": self.metadata.get_stats()
        }
    
    def warm_cache(self, key_pattern: str, data_list: List[Dict]):
        """
        Cache warming - chuẩn bị dữ liệu vào cache từ trước
        Useful cho startup hoặc batch refresh
        """
        try:
            count = 0
            for item in data_list:
                if isinstance(item, dict):
                    item_id = item.get('id') or item.get('StationId') or item.get('RouteId')
                    if item_id:
                        key = f"{key_pattern}:{item_id}"
                        self.set(key, item)
                        count += 1
            
            logger.info(f"✅ Cache warming: {count} items cached for pattern '{key_pattern}'")
            return count
        except Exception as e:
            logger.error(f"Cache warming error: {e}")
            return 0
    
    def get_or_set(self, key: str, fetch_func, ttl: Optional[int] = None) -> Any:
        """
        Pattern: Get hoặc Set nếu miss
        Tiện ích: Tránh lặp lại logic cache check
        """
        # 1. Thử lấy từ cache
        cached = self.get(key)
        if cached is not None:
            return cached
        
        # 2. Không có → call fetch_func để lấy dữ liệu
        try:
            data = fetch_func()
            if data is not None:
                self.set(key, data, ttl)
            return data
        except Exception as e:
            logger.error(f"get_or_set failed for key {key}: {e}")
            return None


# Global cache instance
cache = CacheLayer()

# ==================== HELPER FUNCTIONS ====================

def cache_key(*parts) -> str:
    """Tạo cache key từ parts"""
    return ":".join(str(p) for p in parts)


def cache_set(key: str, value: Any, ttl: Optional[int] = None) -> bool:
    """Helper function"""
    return cache.set(key, value, ttl)


def cache_get(key: str) -> Optional[Any]:
    """Helper function"""
    return cache.get(key)


def cache_delete(key: str) -> bool:
    """Helper function"""
    return cache.delete(key)


def cache_exists(key: str) -> bool:
    """Helper function"""
    return cache.exists(key)


def cache_clear() -> bool:
    """Helper function"""
    return cache.clear_all()


def cache_get_stats() -> Dict:
    """Helper function"""
    return cache.get_stats()


if __name__ == "__main__":
    # Test cache layer
    logging.basicConfig(level=logging.INFO)
    
    # Test set/get
    cache.set("test:1", {"name": "Bus 1", "route": "10"}, ttl=3600)
    print("Set:", cache.get("test:1"))
    
    # Test stats
    print("Stats:", cache.get_stats())