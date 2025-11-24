import os
import json
import random
from datetime import datetime
from flask import Blueprint, render_template, request, jsonify

# Tạo Blueprint
feedback_bp = Blueprint('feedback', __name__)

# Thiết lập đường dẫn tới file JSON
# (Giả sử file app.py và feedback.py nằm cùng trong folder backend)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
DATA_FILE = os.path.join(BASE_DIR, 'data', 'reviews.json')

# --- HÀM HỖ TRỢ (HELPER FUNCTIONS) ---

def get_all_reviews():
    """Hàm đọc dữ liệu từ file JSON. Các file khác (như app.py) sẽ import hàm này."""
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Lỗi đọc file review: {e}")
        return []

def save_reviews(data):
    """Hàm lưu dữ liệu vào file JSON."""
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

# --- ROUTES ---

@feedback_bp.route('/feedback')
def feedback_page():
    """
    Route hiển thị trang Feedback đầy đủ.
    QUAN TRỌNG: Phải lấy danh sách reviews truyền vào để component hiển thị được.
    """
    reviews = get_all_reviews()
    return render_template('feedback.html', reviews=reviews)

@feedback_bp.route('/api/submit-review', methods=['POST'])
def submit_review():
    """API nhận dữ liệu từ Javascript (Fetch)"""
    data = request.json
    reviews = get_all_reviews()
    
    # Tạo màu ngẫu nhiên cho avatar (Mã HEX không có dấu #)
    colors = ['3C7363', 'D9534F', 'F0AD4E', '5BC0DE', '292B2C', '563D7C']
    
    new_review = {
        'name': data.get('name', 'Ẩn danh'),
        'rating': int(data.get('rating', 5)),
        'text': data.get('text', ''),
        'date': datetime.now().strftime("%d/%m/%Y"),
        'avatar_bg': random.choice(colors) # Chọn màu ngẫu nhiên
    }
    
    # Thêm review mới lên đầu danh sách
    reviews.insert(0, new_review)
    
    # Giới hạn lưu trữ (ví dụ 100 cái mới nhất)
    if len(reviews) > 100:
        reviews = reviews[:100]

    save_reviews(reviews)
    
    return jsonify({'success': True, 'message': 'Đã lưu thành công!'})