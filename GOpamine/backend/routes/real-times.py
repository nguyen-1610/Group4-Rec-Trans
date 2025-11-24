"""
=====================================================
SMART ITINERARY & TRANSPORT ADVISOR - COMPLETE BACKEND
Tích hợp: TomTom Traffic API + OSRM + Weather API
=====================================================
Author: Smart Transport Team
Version: 1.0
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from datetime import datetime
import math
from typing import Optional, Dict, List
from dataclasses import dataclass
from enum import Enum
import logging

# ============================================
# CONFIGURATION
# ============================================

class Config:
    """Cấu hình toàn bộ hệ thống"""
    
    # API Keys - THAY ĐỔI THÀNH KEY CỦA BẠN
    TOMTOM_API_KEY = "IInLxlLdECiULF6kiubdQit0Nhz8YQg2"  # https://developer.tomtom.com
    WEATHER_API_KEY = "58949cf2ce6848f426f68a7f910472d7"  # https://openweathermap.org/api
    
    # API Endpoints
    TOMTOM_BASE_URL = "https://api.tomtom.com/traffic/services/4"
    OSRM_BASE_URL = "https://router.project-osrm.org"
    WEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5"
    
    # Transport costs (VNĐ)
    COST_MOTORBIKE_PER_KM = 3000
    COST_BUS_FIXED = 7000
    COST_GRAB_BASE = 15000
    COST_GRAB_PER_KM = 8000
    
    # Scoring weights
    WEIGHT_TIME = 0.30
    WEIGHT_COST = 0.35
    WEIGHT_COMFORT = 0.20
    WEIGHT_WEATHER = 0.15
    
    # Server config
    HOST = '0.0.0.0'
    PORT = 5000
    DEBUG = True

# ============================================
# ENUMS & DATA CLASSES
# ============================================

class TrafficLevel(Enum):
    """Mức độ giao thông"""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class TransportType(Enum):
    """Loại phương tiện"""
    MOTORBIKE = "motorbike"
    BUS = "bus"
    GRAB = "grab"
    WALKING = "walking"

@dataclass
class Location:
    """Địa điểm"""
    name: str
    lat: float
    lng: float

@dataclass
class TrafficData:
    """Dữ liệu giao thông"""
    level: str
    score: float
    current_speed: float
    free_flow_speed: float
    delay_factor: float

@dataclass
class WeatherData:
    """Dữ liệu thời tiết"""
    condition: str
    temp: float
    rain: float

@dataclass
class TransportOption:
    """Option phương tiện"""
    type: str
    duration: float
    distance: float
    cost: float
    score: float
    geometry: List
    traffic_impact: float

# ============================================
# FLASK APP SETUP
# ============================================

app = Flask(__name__)
CORS(app)

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================
# UTILITY FUNCTIONS
# ============================================

def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Tính khoảng cách giữa 2 điểm (km) - Haversine formula
    """
    R = 6371  # Bán kính Trái Đất (km)
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    
    a = (math.sin(delta_lat/2) ** 2 + 
         math.cos(lat1_rad) * math.cos(lat2_rad) * 
         math.sin(delta_lng/2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

# ============================================
# TOMTOM TRAFFIC SERVICE
# ============================================

class TomTomService:
    """
    Service xử lý TomTom Traffic API
    Doc: https://developer.tomtom.com/traffic-api/documentation
    """
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = Config.TOMTOM_BASE_URL
    
    def get_traffic_flow(self, lat: float, lng: float, zoom: int = 10) -> Optional[TrafficData]:
        """
        Lấy traffic flow tại một điểm
        
        API: /flowSegmentData/{style}/{zoom}/json
        - style: absolute (tốc độ tuyệt đối)
        - zoom: 10-18 (mức chi tiết)
        
        Returns:
            TrafficData object hoặc None nếu lỗi
        """
        url = f"{self.base_url}/flowSegmentData/absolute/{zoom}/json"
        params = {
            'point': f'{lat},{lng}',
            'key': self.api_key,
            'unit': 'KMPH'
        }
        
        try:
            logger.info(f"Fetching traffic data for ({lat}, {lng})")
            response = requests.get(url, params=params, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            return self._parse_traffic_data(data)
            
        except requests.exceptions.RequestException as e:
            logger.error(f"TomTom API Error: {e}")
            return None
    
    def _parse_traffic_data(self, data: dict) -> TrafficData:
        """Parse response từ TomTom API"""
        flow_data = data.get('flowSegmentData', {})
        
        current_speed = flow_data.get('currentSpeed', 0)
        free_flow_speed = flow_data.get('freeFlowSpeed', 50)
        
        # Tính delay factor
        if free_flow_speed > 0 and current_speed > 0:
            speed_ratio = current_speed / free_flow_speed
            delay_factor = 1 / speed_ratio
        else:
            delay_factor = 1.5  # Default delay
        
        # Tính traffic score (0-100, cao = tệ)
        traffic_score = max(0, min(100, (1 - speed_ratio) * 100)) if free_flow_speed > 0 else 50
        
        # Xác định level
        level = self._calculate_level(traffic_score)
        
        return TrafficData(
            level=level.value,
            score=round(traffic_score, 2),
            current_speed=round(current_speed, 2),
            free_flow_speed=round(free_flow_speed, 2),
            delay_factor=round(delay_factor, 2)
        )
    
    def _calculate_level(self, score: float) -> TrafficLevel:
        """Chuyển score sang level"""
        if score < 30:
            return TrafficLevel.LOW
        elif score < 60:
            return TrafficLevel.MEDIUM
        elif score < 80:
            return TrafficLevel.HIGH
        else:
            return TrafficLevel.CRITICAL

# ============================================
# OSRM ROUTING SERVICE
# ============================================

class OSRMService:
    """
    Service tính toán routing qua OSRM
    Doc: http://project-osrm.org/docs/v5.24.0/api/
    """
    
    def __init__(self):
        self.base_url = Config.OSRM_BASE_URL
    
    def get_route(self, from_loc: Location, to_loc: Location, 
                  profile: str = 'car') -> Optional[Dict]:
        """
        Tính route giữa 2 điểm
        
        Args:
            from_loc: Điểm xuất phát
            to_loc: Điểm đến
            profile: 'car', 'bike', 'foot'
        
        Returns:
            Dict với duration (s), distance (m), geometry
        """
        url = f"{self.base_url}/route/v1/{profile}/"
        url += f"{from_loc.lng},{from_loc.lat};"
        url += f"{to_loc.lng},{to_loc.lat}"
        
        params = {
            'overview': 'full',
            'geometries': 'geojson',
            'steps': 'true'
        }
        
        try:
            logger.info(f"Calculating route: {from_loc.name} → {to_loc.name}")
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            if data.get('code') != 'Ok':
                logger.error(f"OSRM Error: {data.get('message')}")
                return None
            
            route = data['routes'][0]
            return {
                'duration': route['duration'],  # seconds
                'distance': route['distance'],  # meters
                'geometry': route['geometry']['coordinates']
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"OSRM Error: {e}")
            return None

# ============================================
# WEATHER SERVICE
# ============================================

class WeatherService:
    """
    Service lấy thông tin thời tiết
    Doc: https://openweathermap.org/current
    """
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = Config.WEATHER_BASE_URL
    
    def get_weather(self, lat: float, lng: float) -> WeatherData:
        """
        Lấy thời tiết hiện tại
        
        Returns:
            WeatherData object
        """
        url = f"{self.base_url}/weather"
        params = {
            'lat': lat,
            'lon': lng,
            'appid': self.api_key,
            'units': 'metric'  # Celsius
        }
        
        try:
            logger.info(f"Fetching weather for ({lat}, {lng})")
            response = requests.get(url, params=params, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            
            return WeatherData(
                condition=data['weather'][0]['main'],
                temp=round(data['main']['temp'], 1),
                rain=round(data.get('rain', {}).get('1h', 0), 1)
            )
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Weather API Error: {e}")
            # Return default weather
            return WeatherData(
                condition='Clear',
                temp=30.0,
                rain=0.0
            )

# ============================================
# TRANSPORT ADVISOR - CORE LOGIC
# ============================================

class TransportAdvisor:
    """
    Service chính - Tư vấn phương tiện tối ưu
    
    Workflow:
    1. Lấy traffic data từ TomTom
    2. Lấy weather data từ OpenWeather
    3. Tính route cho từng phương tiện qua OSRM
    4. Áp dụng traffic delay
    5. Tính score
    6. Recommend phương tiện tốt nhất
    """
    
    def __init__(self):
        self.traffic_service = TomTomService(Config.TOMTOM_API_KEY)
        self.routing_service = OSRMService()
        self.weather_service = WeatherService(Config.WEATHER_API_KEY)
    
    def optimize_route(self, from_loc: Location, to_loc: Location, 
                      budget: float, datetime_obj: datetime) -> Dict:
        """
        Tối ưu hóa route và suggest phương tiện
        
        Args:
            from_loc: Điểm xuất phát
            to_loc: Điểm đến
            budget: Ngân sách (VNĐ)
            datetime_obj: Thời điểm dự kiến
        
        Returns:
            Dict với recommended và alternatives
        """
        logger.info(f"Optimizing route: {from_loc.name} → {to_loc.name}, Budget: {budget}")
        
        # Step 1: Get real-time data
        traffic = self.traffic_service.get_traffic_flow(from_loc.lat, from_loc.lng)
        weather = self.weather_service.get_weather(from_loc.lat, from_loc.lng)
        
        # Fallback traffic nếu API fail
        if traffic is None:
            logger.warning("Traffic API failed, using default values")
            traffic = TrafficData(
                level=TrafficLevel.MEDIUM.value,
                score=50.0,
                current_speed=40.0,
                free_flow_speed=60.0,
                delay_factor=1.5
            )
        
        # Step 2: Calculate transport options
        options = []
        
        # Xe máy
        motorbike = self._calculate_motorbike(from_loc, to_loc, traffic, weather)
        if motorbike:
            options.append(motorbike)
        
        # Xe buýt
        bus = self._calculate_bus(from_loc, to_loc, traffic, weather)
        if bus:
            options.append(bus)
        
        # Grab
        grab = self._calculate_grab(from_loc, to_loc, traffic, weather)
        if grab:
            options.append(grab)
        
        # Đi bộ
        walking = self._calculate_walking(from_loc, to_loc, weather)
        if walking:
            options.append(walking)
        
        # Step 3: Calculate scores
        for option in options:
            option.score = self._calculate_score(option, budget, weather)
        
        # Step 4: Sort by score
        options.sort(key=lambda x: x.score, reverse=True)
        
        # Step 5: Prepare response
        return {
            'recommended': self._option_to_dict(options[0]),
            'alternatives': [self._option_to_dict(opt) for opt in options[1:]],
            'traffic_condition': self._traffic_to_dict(traffic),
            'weather': self._weather_to_dict(weather)
        }
    
    def _calculate_motorbike(self, from_loc: Location, to_loc: Location,
                            traffic: TrafficData, weather: WeatherData) -> Optional[TransportOption]:
        """Tính toán option xe máy"""
        route = self.routing_service.get_route(from_loc, to_loc, 'car')
        if not route:
            return None
        
        distance = route['distance'] / 1000  # km
        base_duration = route['duration'] / 60  # minutes
        
        # Apply traffic delay
        adjusted_duration = base_duration * traffic.delay_factor
        
        # Cost
        cost = distance * Config.COST_MOTORBIKE_PER_KM
        
        return TransportOption(
            type=TransportType.MOTORBIKE.value,
            duration=round(adjusted_duration, 1),
            distance=round(distance, 2),
            cost=round(cost),
            score=0.0,  # Will be calculated later
            geometry=route['geometry'],
            traffic_impact=traffic.delay_factor
        )
    
    def _calculate_bus(self, from_loc: Location, to_loc: Location,
                      traffic: TrafficData, weather: WeatherData) -> Optional[TransportOption]:
        """Tính toán option xe buýt"""
        route = self.routing_service.get_route(from_loc, to_loc, 'car')
        if not route:
            return None
        
        distance = route['distance'] / 1000
        base_duration = (route['duration'] / 60) * 1.3  # Slower 30%
        
        # Bus ít bị traffic ảnh hưởng hơn (60% of delay)
        adjusted_delay = 1 + (traffic.delay_factor - 1) * 0.6
        adjusted_duration = base_duration * adjusted_delay
        
        # Add waiting time
        adjusted_duration += 10  # 10 phút chờ xe
        
        return TransportOption(
            type=TransportType.BUS.value,
            duration=round(adjusted_duration, 1),
            distance=round(distance, 2),
            cost=Config.COST_BUS_FIXED,
            score=0.0,
            geometry=route['geometry'],
            traffic_impact=round(adjusted_delay, 2)
        )
    
    def _calculate_grab(self, from_loc: Location, to_loc: Location,
                       traffic: TrafficData, weather: WeatherData) -> Optional[TransportOption]:
        """Tính toán option Grab"""
        route = self.routing_service.get_route(from_loc, to_loc, 'car')
        if not route:
            return None
        
        distance = route['distance'] / 1000
        base_duration = route['duration'] / 60
        
        # Apply traffic delay (same as motorbike)
        adjusted_duration = base_duration * traffic.delay_factor
        
        # Cost calculation
        cost = max(Config.COST_GRAB_BASE, 
                   Config.COST_GRAB_BASE + distance * Config.COST_GRAB_PER_KM)
        
        # Surge pricing based on traffic
        if traffic.level == TrafficLevel.CRITICAL.value:
            cost *= 1.5
        elif traffic.level == TrafficLevel.HIGH.value:
            cost *= 1.2
        
        return TransportOption(
            type=TransportType.GRAB.value,
            duration=round(adjusted_duration, 1),
            distance=round(distance, 2),
            cost=round(cost),
            score=0.0,
            geometry=route['geometry'],
            traffic_impact=traffic.delay_factor
        )
    
    def _calculate_walking(self, from_loc: Location, to_loc: Location,
                          weather: WeatherData) -> Optional[TransportOption]:
        """Tính toán option đi bộ"""
        route = self.routing_service.get_route(from_loc, to_loc, 'foot')
        if not route:
            return None
        
        distance = route['distance'] / 1000
        
        # Chỉ suggest nếu < 2km
        if distance > 2:
            return None
        
        # Walking speed: ~5 km/h
        duration = (distance / 5) * 60  # minutes
        
        return TransportOption(
            type=TransportType.WALKING.value,
            duration=round(duration, 1),
            distance=round(distance, 2),
            cost=0,
            score=0.0,
            geometry=route['geometry'],
            traffic_impact=1.0  # No traffic impact
        )
    
    def _calculate_score(self, option: TransportOption, budget: float, 
                        weather: WeatherData) -> float:
        """
        Tính score cho phương tiện
        
        Formula:
        Score = w1*time_score + w2*cost_score + w3*comfort_score + w4*weather_score
        """
        # 1. TIME SCORE (0-100, fast = high)
        # Normalize theo 60 phút
        time_score = max(0, 100 - (option.duration / 60) * 100)
        
        # 2. COST SCORE (0-100, cheap = high)
        if budget > 0:
            cost_ratio = option.cost / budget
            cost_score = max(0, 100 - cost_ratio * 100)
        else:
            cost_score = 100 if option.cost == 0 else 50
        
        # 3. COMFORT SCORE
        comfort_map = {
            'grab': 90,
            'motorbike': 70,
            'bus': 60,
            'walking': 50
        }
        comfort_score = comfort_map.get(option.type, 50)
        
        # 4. WEATHER SCORE
        weather_score = self._calculate_weather_score(option.type, weather)
        
        # Weighted sum
        total_score = (
            time_score * Config.WEIGHT_TIME +
            cost_score * Config.WEIGHT_COST +
            comfort_score * Config.WEIGHT_COMFORT +
            weather_score * Config.WEIGHT_WEATHER
        )
        
        return round(total_score, 1)
    
    def _calculate_weather_score(self, transport_type: str, weather: WeatherData) -> float:
        """Tính weather impact score"""
        base_score = 100
        
        # Xe máy - chịu ảnh hưởng nhiều
        if transport_type == 'motorbike':
            if weather.rain > 5:
                base_score -= 60
            elif weather.rain > 2:
                base_score -= 30
        
        # Đi bộ - chịu ảnh hưởng rất nhiều
        elif transport_type == 'walking':
            if weather.rain > 2:
                base_score -= 70
            if weather.temp > 35:
                base_score -= 40
        
        # Xe buýt - ít ảnh hưởng
        elif transport_type == 'bus':
            if weather.rain > 10:
                base_score -= 20
        
        # Grab - không ảnh hưởng
        
        return max(0, base_score)
    
    def _option_to_dict(self, option: TransportOption) -> Dict:
        """Convert TransportOption to dict"""
        return {
            'type': option.type,
            'duration': option.duration,
            'distance': option.distance,
            'cost': option.cost,
            'score': option.score,
            'geometry': option.geometry,
            'traffic_impact': option.traffic_impact
        }
    
    def _traffic_to_dict(self, traffic: TrafficData) -> Dict:
        """Convert TrafficData to dict"""
        return {
            'level': traffic.level,
            'score': traffic.score,
            'current_speed': traffic.current_speed,
            'free_flow_speed': traffic.free_flow_speed,
            'delay_factor': traffic.delay_factor
        }
    
    def _weather_to_dict(self, weather: WeatherData) -> Dict:
        """Convert WeatherData to dict"""
        return {
            'condition': weather.condition,
            'temp': weather.temp,
            'rain': weather.rain
        }

# ============================================
# API ENDPOINTS
# ============================================

# Initialize advisor
advisor = TransportAdvisor()

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'message': 'Smart Transport Advisor is running',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/traffic', methods=['GET'])
def get_traffic():
    """
    Get traffic data at a location
    
    Query params:
        lat (float): Latitude
        lng (float): Longitude
    
    Response:
        {
            "success": true,
            "data": {
                "level": "HIGH",
                "score": 75.5,
                "current_speed": 28.5,
                "free_flow_speed": 60.0,
                "delay_factor": 2.1
            }
        }
    """
    try:
        lat = float(request.args.get('lat'))
        lng = float(request.args.get('lng'))
        
        traffic_service = TomTomService(Config.TOMTOM_API_KEY)
        traffic = traffic_service.get_traffic_flow(lat, lng)
        
        if traffic:
            return jsonify({
                'success': True,
                'data': {
                    'level': traffic.level,
                    'score': traffic.score,
                    'current_speed': traffic.current_speed,
                    'free_flow_speed': traffic.free_flow_speed,
                    'delay_factor': traffic.delay_factor
                }
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Unable to fetch traffic data'
            }), 500
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': 'Invalid lat/lng parameters'
        }), 400
    except Exception as e:
        logger.error(f"Error in get_traffic: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/optimize-route', methods=['POST'])
def optimize_route():
    """
    Main endpoint - Optimize route and recommend transport
    
    Request body:
        {
            "from": {"name": "Bến Thành", "lat": 10.772, "lng": 106.698},
            "to": {"name": "Nhà Thờ Đức Bà", "lat": 10.780, "lng": 106.699},
            "budget": 50000,
            "datetime": "2025-01-15T08:00:00"
        }
    
    Response:
        {
            "success": true,
            "data": {
                "recommended": {...},
                "alternatives": [...],
                "traffic_condition": {...},
                "weather": {...}
            }
        }
    """
    try:
        data = request.json
        
        # Validate input
        if not data.get('from') or not data.get('to'):
            return jsonify({
                'success': False,
                'error': 'Missing from/to locations'
            }), 400
        
        # Parse locations
        from_loc = Location(
            name=data['from']['name'],
            lat=float(data['from']['lat']),
            lng=float(data['from']['lng'])
        )
        
        to_loc = Location(
            name=data['to']['name'],
            lat=float(data['to']['lat']),
            lng=float(data['to']['lng'])
        )
        
        # Parse other params
        budget = float(data.get('budget', 100000))
        datetime_str = data.get('datetime', datetime.now().isoformat())
        
        # Parse datetime
        try:
            datetime_obj = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
        except:
            datetime_obj = datetime.now()
        
        # Optimize route
        result = advisor.optimize_route(from_loc, to_loc, budget, datetime_obj)
        
        return jsonify({
            'success': True,
            'data': result,
            'timestamp': datetime.now().isoformat()
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Invalid input data: {str(e)}'
        }), 400
    except Exception as e:
        logger.error(f"Error in optimize_route: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

# ============================================
# MAIN - RUN SERVER
# ============================================

if __name__ == '__main__':
    print("=" * 70)
    print("    SMART TRANSPORT ADVISOR - Backend Server")
    print("=" * 70)
    print()
    print("📋 Configuration:")
    print(f"   - TomTom API: {'✓ Configured' if Config.TOMTOM_API_KEY != 'YOUR_TOMTOM_API_KEY' else '✗ Not configured'}")
    print(f"   - Weather API: {'✓ Configured' if Config.WEATHER_API_KEY != 'YOUR_WEATHER_API_KEY' else '✗ Not configured'}")
    print()
    print("🌐 API Endpoints:")
    print("   GET  /api/health           - Health check")
    print("   GET  /api/traffic          - Get traffic data")
    print("   POST /api/optimize-route   - Optimize route & recommend transport")
    print()
    print(f"🚀 Server starting on http://{Config.HOST}:{Config.PORT}")
    print("=" * 70)
    print()
    
    if Config.TOMTOM_API_KEY == 'YOUR_TOMTOM_API_KEY':
        print("⚠️  WARNING: TomTom API key not configured!")
        print("   Get your free API key at: https://developer.tomtom.com")
        print()
    
    if Config.WEATHER_API_KEY == 'YOUR_WEATHER_API_KEY':
        print("⚠️  WARNING: Weather API key not configured!")
        print("   Get your free API key at: https://openweathermap.org/api")
        print()
    
    app.run(debug=Config.DEBUG, host=Config.HOST, port=Config.PORT)