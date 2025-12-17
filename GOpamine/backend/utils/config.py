"""
CONFIG CACHE - Cấu hình toàn bộ cache system
Phục vụ cho bus routing application
"""
import os
from datetime import timedelta

# ==================== CACHE CONFIG ====================
CACHE_CONFIG = {
    # 🔵 REDIS (Nếu có)
    "USE_REDIS": os.getenv("USE_REDIS", "false").lower() == "true",
    "REDIS_URL": os.getenv("REDIS_URL", "redis://localhost:6379/0"),
    "REDIS_TIMEOUT": 5,  # Timeout khi connect Redis (giây)
    
    # 🟢 IN-MEMORY CACHE (Fallback nếu Redis down hoặc không dùng)
    "USE_MEMORY_CACHE": True,  # Luôn bật
    
    # ⏱️ TTL (Time To Live) - Thời gian cache tồn tại
    "TTL": {
        "stations": 24 * 3600,          # 24 giờ
        "routes": 24 * 3600,             # 24 giờ
        "pathpoints": 24 * 3600,         # 24 giờ
        "transfer_points": 12 * 3600,    # 12 giờ
        "route_geometry": 12 * 3600,     # 12 giờ
        "nearby_stations": 1 * 3600,     # 1 giờ
    },
    
    # 📦 BATCH SIZE - Kích thước tối đa của batch khi load từ DB
    "BATCH_SIZE": 500,
    
    # 🔄 AUTO REFRESH
    "AUTO_REFRESH": True,
    "REFRESH_INTERVAL": 24 * 3600,  # Refresh 1 ngày 1 lần (giây)
    "REFRESH_TIME": "02:00",         # Thời điểm refresh: 2:00 AM
    
    # 📊 MEMORY LIMITS
    "MAX_MEMORY_USAGE_MB": 500,      # Tối đa 500MB RAM cho cache
    "EVICTION_POLICY": "lru",        # Xóa LRU khi vượt quá RAM
}

# ==================== DATABASE CONFIG ====================
SUPABASE_CONFIG = {
    "BATCH_SIZE": 500,
    "TIMEOUT": 10,  # Timeout query (giây)
    "RETRY": 3,     # Số lần retry nếu fail
}

# ==================== LOGGING CONFIG ====================
LOGGING_CONFIG = {
    "LOG_DIR": os.path.join(os.path.dirname(__file__), '../../logs'),
    "LOG_LEVEL": os.getenv("LOG_LEVEL", "INFO"),
    "LOG_MAX_BYTES": 10 * 1024 * 1024,  # 10MB
    "LOG_BACKUP_COUNT": 5,
}

# ==================== DATA CONFIG ====================
DATA_CONFIG = {
    # Các tuyến này sẽ được ignore (không cache)
    "INACTIVE_ROUTES": [],  # Bạn có thể định nghĩa sau
    
    # Tọa độ trung tâm HCMC (để phục vụ queries)
    "CENTER_LAT": 10.7769,
    "CENTER_LNG": 106.7009,
    
    # Giới hạn tìm kiếm mặc định (km)
    "DEFAULT_SEARCH_RADIUS": 2.0,
    "MAX_SEARCH_RADIUS": 5.0,
}

# ==================== API CONFIG ====================
API_CONFIG = {
    "OSRM_TIMEOUT": 5,
    "OSRM_RETRIES": 2,
    "OSRM_CHUNK_SIZE": 25,
}

print("✅ Cache config loaded successfully")