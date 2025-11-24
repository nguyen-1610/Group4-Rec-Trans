from flask import Flask, render_template
import os

# 1. IMPORT TỪ FEEDBACK.PY
# (Đảm bảo file feedback.py nằm cùng thư mục với app.py)
from feedback import feedback_bp, get_all_reviews

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'frontend', 'templates'),
    static_folder=os.path.join(BASE_DIR, 'frontend', 'static')
)

# 2. ĐĂNG KÝ BLUEPRINT
# Bước này giúp app nhận diện các đường dẫn '/feedback' và '/api/submit-review'
app.register_blueprint(feedback_bp)

@app.route('/')
def index():
    # 3. LẤY DỮ LIỆU VÀ TRUYỀN VÀO HOME
    # Lấy tất cả review từ file json
    all_reviews = get_all_reviews()
    
    # Chỉ lấy 3 review mới nhất để hiện ngoài trang chủ cho đẹp
    latest_reviews = all_reviews[:3]
    
    # Truyền biến 'reviews' vào render_template
    return render_template('home.html', reviews=latest_reviews)

@app.route('/register')
@app.route('/register/')
def register():
    return render_template('register.html')

@app.route('/login')
@app.route('/login/')
def login():
    return render_template('login.html')

if __name__ == '__main__':
    app.run(debug=True)