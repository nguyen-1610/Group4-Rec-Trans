from flask import Flask, request, jsonify
from flask_cors import CORS
from config import Config
from gemini_handler import GeminiBot
import uuid

gemini_bot = GeminiBot()

app = Flask(__name__)
CORS(app)
app.config.from_object(Config)

# Lưu session chat (tạm thời dùng dict, sau này dùng Redis)
chat_sessions = {}

@app.route('/api/health', methods=['GET'])
def health_check():
    """Kiểm tra server có hoạt động không"""
    return jsonify({"status": "ok", "message": "Server is running"})

@app.route('/api/session', methods=['POST'])
def create_session():
    """Tạo session mới cho user"""
    session_id = str(uuid.uuid4())
    chat_sessions[session_id] = {
        "history": [],
        "form_data": None
    }
    return jsonify({"session_id": session_id})

@app.route('/api/chat', methods=['POST'])
def chat():
    """Endpoint xử lý chat"""
    try:
        data = request.json
        
        # Kiểm tra dữ liệu đầu vào
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        session_id = data.get('session_id')
        message = data.get('message')
        
        # Validate
        if not session_id:
            return jsonify({"error": "Missing session_id"}), 400
        
        if not message:
            return jsonify({"error": "Missing message"}), 400
        
        if session_id not in chat_sessions:
            return jsonify({"error": "Invalid session"}), 400
        
        # Lấy context từ form_data nếu có
        context = None
        if chat_sessions[session_id].get("form_data"):
            form_data = chat_sessions[session_id]["form_data"]
            context = f"Thông tin người dùng: {form_data}"
        
        # Gọi Gemini
        response_text = gemini_bot.chat(message, context)
        
        # Lưu lịch sử
        chat_sessions[session_id]["history"].append({
            "user": message,
            "bot": response_text
        })
        
        return jsonify({
            "response": response_text,
            "session_id": session_id
        }), 200
        
    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")  # Log lỗi
        return jsonify({"error": str(e)}), 500

@app.route('/api/form', methods=['POST'])
def submit_form():
    """Nhận dữ liệu từ form"""
    data = request.json
    session_id = data.get('session_id')
    form_data = data.get('form_data')
    
    if session_id in chat_sessions:
        chat_sessions[session_id]["form_data"] = form_data
    
    return jsonify({"status": "success"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)