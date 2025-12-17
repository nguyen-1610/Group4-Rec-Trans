from flask import Blueprint, request, jsonify
import requests
from backend.routes.bus_manager import find_nearby_stations
from backend.utils.bus_routing import find_smart_bus_route

# Blueprint chỉ chứa logic/API của form để app.py phụ trách render template
form_bp = Blueprint('form_api', __name__)

# OSRM API (Open Source Routing Machine)
OSRM_BASE_URL = "http://router.project-osrm.org/route/v1"


@form_bp.route('/api/find-route-osm', methods=['POST'])
def find_route_osm():
    """
    Tìm đường đi giữa 2 điểm sử dụng OSRM và trả về dữ liệu cho frontend.
    """
    try:
        data = request.json or {}
        start = data.get('start')  # {lat, lon, name}
        end = data.get('end')      # {lat, lon, name}
        vehicle_type = data.get('vehicle_type', 'car')
        vehicle_speed = data.get('vehicle_speed', 45)  # Giữ để tuỳ biến tốc độ nếu cần

        if not start or not end:
            return jsonify({
                'success': False,
                'error': 'Thiếu thông tin điểm xuất phát hoặc điểm đến'
            }), 400

        profile = get_osrm_profile(vehicle_type)
        coordinates = f"{start['lon']},{start['lat']};{end['lon']},{end['lat']}"

        osrm_url = f"{OSRM_BASE_URL}/{profile}/{coordinates}"
        params = {
            'overview': 'full',
            'geometries': 'geojson',
            'steps': 'true'
        }

        response = requests.get(osrm_url, params=params, timeout=10)

        if response.status_code != 200:
            return jsonify({
                'success': False,
                'error': 'Không thể tìm đường đi từ OSRM'
            }), 500

        osrm_data = response.json()

        if not osrm_data.get('routes'):
            return jsonify({
                'success': False,
                'error': 'Không tìm thấy tuyến đường phù hợp'
            }), 404

        route = osrm_data['routes'][0]
        geometry = route['geometry']['coordinates']
        distance_m = route['distance']
        duration_s = route['duration']

        result = {
            'route_coordinates': geometry,  # [[lon, lat], ...]
            'waypoints': [
                {
                    'lat': start['lat'],
                    'lon': start['lon'],
                    'name': start.get('name')
                },
                {
                    'lat': end['lat'],
                    'lon': end['lon'],
                    'name': end.get('name')
                }
            ],
            'distance_km': round(distance_m / 1000, 2),
            'duration_min': round(duration_s / 60, 1),
            'total_waypoints': len(geometry)
        }

        return jsonify({
            'success': True,
            'data': result
        })

    except requests.exceptions.Timeout:
        return jsonify({
            'success': False,
            'error': 'Timeout khi gọi OSRM API'
        }), 504

    except Exception as e:
        print(f"Error in find_route_osm: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@form_bp.route('/api/find-bus-route', methods=['POST'])
def find_bus_route():
    """
    Tìm tuyến xe bus giữa 2 điểm
    """
    try:
        from bus_routes import find_smart_bus_route
        
        data = request.json or {}
        start = data.get('start')
        end = data.get('end')
        limit = data.get('limit', 3)
        
        if not start or not end:
            return jsonify({
                'success': False,
                'error': 'Thiếu start/end'
            }), 400
        
        start_coords = {'lat': start['lat'], 'lon': start['lon']}
        end_coords = {'lat': end['lat'], 'lon': end['lon']}
        
        # Gọi hàm bus routing
        result = find_smart_bus_route(start_coords, end_coords, skip_validation=True, limit=limit)
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@form_bp.route('/api/geocode', methods=['GET'])
def geocode_place():
    """
    Reverse geocoding: Từ tọa độ -> địa chỉ bằng Nominatim.
    """
    try:
        lat = request.args.get('lat')
        lon = request.args.get('lon')

        if not lat or not lon:
            return jsonify({
                'success': False,
                'error': 'Thiếu tham số lat hoặc lon'
            }), 400

        nominatim_url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            'lat': lat,
            'lon': lon,
            'format': 'json',
            'addressdetails': 1
        }
        headers = {
            'User-Agent': 'RouteOptimizer/1.0'
        }

        response = requests.get(nominatim_url, params=params, headers=headers, timeout=15)

        if response.status_code != 200:
            return jsonify({
                'success': False,
                'error': 'Không thể lấy thông tin địa chỉ'
            }), 500

        data = response.json()

        return jsonify({
            'success': True,
            'data': {
                'display_name': data.get('display_name'),
                'address': data.get('address', {})
            }
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def get_osrm_profile(vehicle_type: str) -> str:
    """
    Chuyển đổi vehicle_type sang OSRM profile.
    """
    profile_map = {
        'car': 'driving',
        'motorbike': 'driving',  # OSRM không có profile riêng cho xe máy
        'bike': 'cycling',
        'walk': 'foot'
    }
    return profile_map.get(vehicle_type, 'driving')