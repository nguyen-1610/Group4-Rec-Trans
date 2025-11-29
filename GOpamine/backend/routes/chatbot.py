import math
import os
from importlib import util as importlib_util

from flask import Blueprint, request, jsonify
from gemini_handler import GeminiBot
import uuid

from pricing_score import UserRequest, WeatherContext, calculate_adaptive_scores

from astar import AStarRouter

ROUTER = AStarRouter()

def _load_realtime_module():
    """
    File real-times.py có dấu gạch ngang nên không import trực tiếp được.
    Hàm này giúp load module đó để tái sử dụng hàm build_realtime_snapshot.
    """
    module_path = os.path.join(os.path.dirname(__file__), "real_times.py")
    if not os.path.exists(module_path):
        return None

    spec = importlib_util.spec_from_file_location("routes.real_times_module", module_path)
    if spec and spec.loader:
        module = importlib_util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    return None


REALTIME_MODULE = _load_realtime_module()
BUILD_REALTIME_SNAPSHOT = getattr(REALTIME_MODULE, "build_realtime_snapshot", None)

# Tạo Blueprint cho chatbot
chatbot_bp = Blueprint('chatbot', __name__)

# Lưu session chat - mỗi session có 1 GeminiBot riêng
chat_sessions = {}

@chatbot_bp.route('/api/health', methods=['GET'])
def health_check():
    """Kiểm tra server có hoạt động không"""
    return jsonify({"status": "ok", "message": "Chatbot is running"})

@chatbot_bp.route('/api/session', methods=['POST'])
def create_session():
    """Tạo session mới cho user"""
    session_id = str(uuid.uuid4())
    
    # Tạo GeminiBot instance riêng cho mỗi session
    chat_sessions[session_id] = {
        "bot": GeminiBot(),
        "history": [],
        "form_data": None,
        "session_started": False
    }
    
    return jsonify({"session_id": session_id})

@chatbot_bp.route('/api/chat', methods=['POST'])
def chat():
    """Endpoint xử lý chat"""
    try:
        data = request.json
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        session_id = data.get('session_id')
        message = data.get('message')
        
        # Validate
        if not session_id or not message:
            return jsonify({"error": "Missing session_id or message"}), 400
        
        if session_id not in chat_sessions:
            return jsonify({"error": "Invalid session"}), 400
        
        session = chat_sessions[session_id]
        bot = session["bot"]
        
        # Nếu chưa start session và có form_data, start với context
        if not session["session_started"] and session.get("form_data"):
            form_data = session["form_data"]
            context = format_form_context(form_data)
            bot.start_session(context)
            session["session_started"] = True
        
        # Gọi Gemini chat
        context_blocks = []
        realtime_weather = None
        realtime_traffic = None

        if BUILD_REALTIME_SNAPSHOT:
            try:
                realtime_snapshot = BUILD_REALTIME_SNAPSHOT()
                context_blocks.append(realtime_snapshot.get("context"))
                realtime_weather = realtime_snapshot.get("weather")
                realtime_traffic = realtime_snapshot.get("traffic")
            except Exception as realtime_err:
                print(f"[Realtime] Lỗi khi lấy dữ liệu: {realtime_err}")
        else:
            print("[Realtime] Không thể load module real-times.py")

        if session.get("form_data"):
            pricing_context = build_pricing_context(
                session["form_data"],
                realtime_weather,
                realtime_traffic
            )
            if pricing_context:
                context_blocks.append(pricing_context)
                
            advanced_context = build_advanced_pricing_context(session["form_data"])
            if advanced_context:
                context_blocks.append(advanced_context)

        combined_context = "\n\n".join([c for c in context_blocks if c]) or None

        response_text = bot.chat(message, context=combined_context)
        
        # Lưu lịch sử
        session["history"].append({
            "user": message,
            "bot": response_text
        })
        
        return jsonify({
            "response": response_text,
            "session_id": session_id
        }), 200
        
    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@chatbot_bp.route('/api/form', methods=['POST'])
def submit_form():
    """Nhận dữ liệu từ form"""
    try:
        data = request.json
        session_id = data.get('session_id')
        form_data = data.get('form_data')
        
        if not session_id:
            return jsonify({"error": "Missing session_id"}), 400
        
        # Tạo session mới nếu chưa có
        if session_id not in chat_sessions:
            chat_sessions[session_id] = {
                "bot": GeminiBot(),
                "history": [],
                "form_data": None,
                "session_started": False
            }
        
        # Lưu form data
        chat_sessions[session_id]["form_data"] = form_data
        
        return jsonify({"status": "success"})
        
    except Exception as e:
        print(f"Error in form endpoint: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@chatbot_bp.route('/api/reset', methods=['POST'])
def reset_session():
    """Reset chat session"""
    try:
        data = request.json
        session_id = data.get('session_id')
        
        if session_id in chat_sessions:
            chat_sessions[session_id]["bot"].reset_session()
            chat_sessions[session_id]["history"] = []
            chat_sessions[session_id]["session_started"] = False
            
        return jsonify({"status": "success"})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def format_form_context(form_data):
    """Format form data thành context cho Gemini"""
    context_parts = []
    
    # Điểm xuất phát
    if form_data.get('origin'):
        context_parts.append(f"📍 Điểm xuất phát: {form_data['origin']}")
    
    # Điểm đến (có thể có nhiều)
    if form_data.get('destinations'):
        destinations = form_data['destinations']
        if isinstance(destinations, list) and len(destinations) > 0:
            if len(destinations) == 1:
                context_parts.append(f"🎯 Điểm đến: {destinations[0]}")
            else:
                dest_list = "\n   ".join([f"{i+1}. {d}" for i, d in enumerate(destinations)])
                context_parts.append(f"🎯 Các điểm đến:\n   {dest_list}")
    
    # Ngân sách
    if form_data.get('budget'):
        budget = int(form_data['budget'])
        context_parts.append(f"💰 Ngân sách: {budget:,} VNĐ")
    
    # Số hành khách
    if form_data.get('passengers'):
        context_parts.append(f"👥 Số hành khách: {form_data['passengers']}")
    
    # Ưu tiên
    if form_data.get('preferences') and len(form_data['preferences']) > 0:
        prefs = ", ".join(form_data['preferences'])
        context_parts.append(f"⭐ Ưu tiên: {prefs}")
    
    return "\n".join(context_parts) if context_parts else None


def build_pricing_context(form_data, weather_payload, traffic_payload):
    """Tạo đoạn context ngắn gọn từ thuật toán pricing_score."""
    try:
        distance_km = estimate_trip_distance(form_data)
        if distance_km is None:
            return None

        normalized_priorities = normalize_priorities(form_data.get("preferences", []))
        user = UserRequest(
            is_student=is_student(form_data),
            priorities=normalized_priorities
        )

        weather_ctx = build_weather_context(weather_payload)
        traffic_level = derive_traffic_level(traffic_payload)

        scores = calculate_adaptive_scores(
            user=user,
            trip_distance=distance_km,
            weather_ctx=weather_ctx,
            traffic_level=traffic_level
        )

        if not scores:
            return None

        top_choices = scores[:3]
        readable_priorities = describe_priorities(normalized_priorities)
        lines = [
            "[GỢI Ý PHƯƠNG TIỆN TỪ DỮ LIỆU GOpamine]",
            f"- Quãng đường ước tính: ~{round(distance_km, 1)} km, "
            f"ưu tiên: {', '.join(readable_priorities) or 'cân bằng'}."
        ]

        for option in top_choices:
            label = f" ({', '.join(option['labels'])})" if option.get("labels") else ""
            lines.append(
                f"- {option['mode_name']}: ~{option['price']:,}đ | "
                f"{option['duration']} phút | Điểm {option['score']}{label}"
            )

        return "\n".join(lines)
    except Exception as exc:
        print(f"[Pricing] Lỗi tạo context: {exc}")
        return None


def build_advanced_pricing_context(form_data):
    """
    Sử dụng AStarRouter để tính toán và so sánh giá các hãng (Grab, Be, XanhSM, Bus).
    """
    try:
        start_id = form_data.get('start_id')
        dest_ids = form_data.get('destination_ids')
        
        if not start_id or not dest_ids:
            return None

        is_sv = is_student(form_data)

        # Gọi AStarRouter
        result = ROUTER.plan_multi_stop_trip(
            start_id=int(start_id),
            destination_ids=[int(x) for x in dest_ids],
            is_student=is_sv
        )

        if not result['success']:
            return None

        data = result['data']
        summary = data.get('summary', []) # Đã sort từ rẻ -> đắt
        segments = data.get('segments', [])

        # Xây dựng context cho Gemini
        lines = [
            "\n[DỮ LIỆU LỘ TRÌNH & BẢNG GIÁ CÁC HÃNG XE]",
            f"- Tổng hành trình: {data['total_distance_km']} km (qua {len(segments)} chặng di chuyển).",
            "- BẢNG GIÁ ƯỚC TÍNH (Tổng chuyến đi):"
        ]
        
        # Liệt kê tất cả các hãng để người dùng chọn
        for item in summary: 
            icon = "🚌" if "Buýt" in item['name'] else ("🏍️" if "Bike" in item['name'] else "🚗")
            lines.append(f"  {icon} {item['name']}: {item['display_total']}")

        lines.append("\n- Chi tiết từng chặng (Tham khảo):")
        for seg in segments:
            # Lấy giá của phương tiện rẻ nhất (thường là bus) và đắt nhất (car) để làm khoảng giá
            prices = seg.get('prices', {})
            # Ví dụ lấy giá GrabBike để hiển thị mẫu
            grab_bike = prices.get('grab_bike', {}).get('display', 'N/A')
            lines.append(f"  + {seg['from_name']} -> {seg['to_name']} ({seg['distance_km']}km) | GrabBike: ~{grab_bike}")
        
        lines.append("[Hết dữ liệu - Hãy tư vấn dựa trên bảng giá các hãng ở trên]")
        
        return "\n".join(lines)

    except Exception as e:
        print(f"[Advanced Pricing Error] {e}")
        return None

def is_student(form_data):
    marker = str(form_data.get("passengers", "")).strip().lower()
    return "sinh viên" in marker


def normalize_priorities(preferences):
    mapping = {
        "tốc độ": "speed",
        "speed": "speed",
        "tiết kiệm": "saving",
        "tiết kiệm chi phí": "saving",
        "saving": "saving",
        "thoải mái": "comfort",
        "comfort": "comfort",
        "an toàn": "safety",
        "safety": "safety",
        "cân bằng": "balance"
    }
    normalized = []
    for pref in preferences or []:
        key = mapping.get(str(pref).strip().lower())
        if key and key not in normalized:
            normalized.append(key)
    return normalized or ["speed", "safety"]


def describe_priorities(priorities):
    labels = {
        "speed": "tốc độ",
        "saving": "tiết kiệm",
        "comfort": "thoải mái",
        "safety": "an toàn",
        "balance": "cân bằng"
    }
    return [labels.get(item, item) for item in priorities]


def estimate_trip_distance(form_data):
    origin = form_data.get("origin")
    destinations = form_data.get("destinations") or []
    if not origin or not destinations:
        return None

    points = [origin] + destinations
    total = 0.0
    for idx in range(len(points) - 1):
        start = _to_coordinates(points[idx])
        end = _to_coordinates(points[idx + 1])
        if not start or not end:
            continue
        total += haversine_distance_km(start, end)
    return total if total > 0 else None


def _to_coordinates(point):
    try:
        lat = float(point.get("lat"))
        lon = float(point.get("lon"))
        return (lat, lon)
    except (TypeError, ValueError):
        return None


def haversine_distance_km(start, end):
    R = 6371.0
    lat1, lon1 = map(math.radians, start)
    lat2, lon2 = map(math.radians, end)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def build_weather_context(weather_payload):
    if not weather_payload or not weather_payload.get("success"):
        return WeatherContext(False, False, "Không rõ")

    is_raining = bool(weather_payload.get("dang_mua"))
    is_hot = weather_payload.get("nhiet_do", 0) > 34
    desc = weather_payload.get("mo_ta", "Không rõ")
    return WeatherContext(is_raining, is_hot, desc)


def derive_traffic_level(traffic_payload):
    if not traffic_payload or not traffic_payload.get("success"):
        return 0.4
    return 0.8 if traffic_payload.get("co_ket_xe") else 0.4