import os
import sys
import random
from datetime import datetime
from flask import Blueprint, render_template, request, jsonify
from flask_login import current_user  # Cần cái này để biết ai đang gửi feedback

# --- 1. CẤU HÌNH IMPORT DB ---
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.abspath(os.path.join(current_dir, '..'))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from database.supabase_client import supabase

feedback_bp = Blueprint('feedback', __name__)

# --- 2. HÀM LẤY DỮ LIỆU TỪ DB (Thay cho JSON load) ---
def get_reviews_from_db():
    try:
        # Join bảng Feedback với bảng users để lấy tên người dùng
        # Sắp xếp cái mới nhất lên đầu
        response = (
            supabase
            .from_("Feedback")
            .select("rating, comment, feedback_date, user_id, users(username)")
            .order("feedback_date", desc=True)
            .limit(100)
            .execute()
        )

        rows = response.data or []

        # Xử lý dữ liệu để khớp với format Frontend đang dùng
        colors = ['3C7363', 'D9534F', 'F0AD4E', '5BC0DE', '292B2C', '563D7C']

        formatted_reviews = []
        for row in rows:
            formatted_reviews.append({
                'name': row.get('users', {}).get('username', 'Người dùng ẩn'),
                'rating': row.get('rating', 5),
                'text': row.get('comment', ''),
                'date': row.get('feedback_date'),
                'avatar_bg': random.choice(colors)
            })

        return formatted_reviews

    except Exception as e:
        print(f"❌ Lỗi lấy feedback: {e}")
        return []

# --- 3. ROUTES ---

@feedback_bp.route('/feedback')
def feedback_page():
    reviews = get_reviews_from_db()
    return render_template('feedback.html', reviews=reviews)

@feedback_bp.route('/api/submit-review', methods=['POST'])
def submit_review():
    """API lưu feedback vào Supabase"""

    # Kiểm tra xem user có đăng nhập chưa? (Bắt buộc vì DB cần user_id)
    if not current_user.is_authenticated:
        return jsonify({'success': False, 'message': 'Bạn cần đăng nhập để gửi đánh giá!'}), 401

    try:
        data = request.json

        # Lấy dữ liệu từ Frontend
        rating = int(data.get('rating', 5))
        comment = data.get('text', '')

        # Lấy user_id từ session đăng nhập hiện tại
        user_id = current_user.user_id

        # Lấy ngày hiện tại
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Ghi vào Supabase
        response = (
            supabase
            .table("Feedback")
            .insert({
                "user_id": user_id,
                "rating": rating,
                "comment": comment,
                "feedback_date": now
            })
            .execute()
        )

        # Supabase insert trả về mảng; nếu có data tức là thành công
        if response.data:
            return jsonify({'success': True, 'message': 'Đã lưu thành công!'})
        else:
            return jsonify({'success': False, 'message': 'Lỗi khi lưu vào Database'}), 500

    except Exception as e:
        print(f"❌ Lỗi submit feedback: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
