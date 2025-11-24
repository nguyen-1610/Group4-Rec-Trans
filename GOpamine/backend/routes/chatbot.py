from flask import Flask, request, jsonify
from flask_cors import CORS
from utils.config import Config
from utils.gemini_handler import GeminiBot
import uuid

app = Flask(__name__)
CORS(app)
app.config.from_object(Config)

# Lưu session chat - mỗi session có 1 GeminiBot riêng
chat_sessions = {}

@app.route('/api/health', methods=['GET'])
def health_check():
    """Kiểm tra server có hoạt động không"""
    return jsonify({"status": "ok", "message": "Server is running"})

@app.route('/api/session', methods=['POST'])
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

@app.route('/api/chat', methods=['POST'])
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
        response_text = bot.chat(message)
        
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

@app.route('/api/form', methods=['POST'])
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

@app.route('/api/reset', methods=['POST'])
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

if __name__ == '__main__':
    app.run(debug=True, port=5000)