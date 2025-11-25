from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os
import sys
from feedback import feedback_bp, get_all_reviews
from astar import create_api_blueprint
from form import form_bp

# 2. IMPORT TỪ CHATBOT.PY
from chatbot import chatbot_bp

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

DB_PATH = os.path.join(BASE_DIR, 'data', 'tourism-landmarks.db')

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'frontend', 'templates'),
    static_folder=os.path.join(BASE_DIR, 'frontend', 'static')
)
CORS(app)

# Cho phép frontend chạy trên domain/port khác gọi được API backend
CORS(app, resources={r"/api/*": {"origins": "*"}})

# 3. ĐĂNG KÝ BLUEPRINT
# Bước này giúp app nhận diện các đường dẫn '/feedback' và '/api/submit-review'
app.register_blueprint(feedback_bp)
app.register_blueprint(chatbot_bp)
app.register_blueprint(create_api_blueprint(DB_PATH))
app.register_blueprint(form_bp)


# ========== ROUTES HTML ==========
@app.route('/')
def index():
    all_reviews = get_all_reviews()
    latest_reviews = all_reviews[:3]
    return render_template('home.html', reviews=latest_reviews)

@app.route('/register')
@app.route('/register/')
def register():
    return render_template('register.html')

@app.route('/login')
@app.route('/login/')
def login():
    return render_template('login.html')

@app.route('/form')
@app.route('/form/')
def form():
	return render_template('form.html')


@app.route('/map_trans')
@app.route('/map_trans/')
def map_trans():
	return render_template('map_trans.html')


@app.route('/chatbot')
@app.route('/chatbot/')
def chatbot():
	return render_template('chatbot.html')

# ========== ERROR HANDLERS ==========

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404


@app.errorhandler(500)
def internal_error(e):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

if __name__ == '__main__':
    app.run(debug=True)