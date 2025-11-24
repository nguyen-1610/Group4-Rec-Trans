import google.generativeai as genai
from config import Config
import json

class GeminiBot:
    def __init__(self):
        genai.configure(api_key=Config.GEMINI_API_KEY)
        
        # System prompt - Định nghĩa vai trò và nhiệm vụ của bot
        self.system_instruction = """
Bạn là trợ lý AI chuyên về lập kế hoạch di chuyển và giao thông tại Thành phố Hồ Chí Minh, Việt Nam. Tên bạn là "GOpamine Assistant".

**NHIỆM VỤ CỦA BẠN:**
1. Tư vấn và gợi ý phương tiện di chuyển phù hợp dựa trên:
   - Chi phí ngân sách của người dùng
   - Thời gian di chuyển
   - Độ thoải mái
   - Sở thích cá nhân (tốc độ, tiết kiệm, an toàn...)

2. Đề xuất lộ trình di chuyển tối ưu giữa các địa điểm
   - Xử lý cả trường hợp đi qua nhiều điểm (multi-stop route)
   - Tối ưu hóa thứ tự điểm dừng nếu cần

3. Gợi ý "giờ vàng" (thời gian tốt nhất để di chuyển, tránh kẹt xe)

4. Cung cấp thông tin thời tiết và tình hình giao thông realtime

**NGUYÊN TẮC:**
- KHÔNG cung cấp thông tin cá nhân hoặc tư vấn y tế, pháp lý
- KHÔNG trả lời đối với các địa điểm ngoài Thành phố Hồ Chí Minh
- Luôn thân thiện, ngắn gọn, dễ hiểu
- Nếu người dùng hỏi ngoài phạm vi, lịch sự từ chối và gợi ý họ hỏi về di chuyển
- Nếu người dùng đã cung cấp thông tin (điểm xuất phát, điểm đến, ngân sách...), LUÔN SỬ DỤNG thông tin đó để tư vấn cụ thể

**CÁCH TRẢ LỜI:**
- Dễ hiểu
- Liệt kê theo ý, yếu tố rõ ràng
- Dùng emoji phù hợp (🚗 🚌 🚆 ⏰ ☀️ 🌧️ ...)
- Nếu cần thông tin thêm, hỏi người dùng
- Nếu người dùng đã điền form, ƯU TIÊN tư vấn dựa trên thông tin form trước
- Với nhiều điểm đến, đề xuất thứ tự tối ưu hoặc hỏi người dùng muốn đi theo thứ tự nào
"""

        # Khởi tạo model với system instruction
        self.model = genai.GenerativeModel(
            'gemini-2.5-pro',
            system_instruction=self.system_instruction
        )
        
        # Khởi tạo chat session
        self.chat_session = None
    
    def start_session(self, context=None):
        """Bắt đầu session chat mới"""
        history = []
        
        if context:
            # Thêm context từ form vào history
            history.append({
                "role": "user",
                "parts": [f"Thông tin của tôi: {context}"]
            })
            history.append({
                "role": "model",
                "parts": ["Tôi đã ghi nhận thông tin của bạn. Tôi sẵn sàng hỗ trợ bạn lên kế hoạch di chuyển! 🚗"]
            })
        
        self.chat_session = self.model.start_chat(history=history)
        return self.chat_session
    
    def chat(self, message, context=None, history=None):
        """
        Chat với Gemini
        - message: tin nhắn từ user
        - context: thông tin từ form (nếu có)
        - history: lịch sử chat (để duy trì ngữ cảnh)
        """
        try:
            # Nếu chưa có session, tạo mới
            if not self.chat_session:
                self.start_session(context)
            
            # Gửi message
            response = self.chat_session.send_message(message)
            
            if response and hasattr(response, 'text'):
                return response.text
            else:
                return "Xin lỗi, tôi không thể tạo phản hồi. Bạn có thể hỏi lại không? 😊"
                
        except Exception as e:
            print(f"Gemini error: {str(e)}")
            
            # Xử lý lỗi cụ thể
            if "quota" in str(e).lower():
                return "⚠️ Hệ thống đang quá tải. Vui lòng thử lại sau vài giây."
            elif "safety" in str(e).lower():
                return "⚠️ Tin nhắn của bạn vi phạm chính sách an toàn. Vui lòng diễn đạt khác đi."
            else:
                return f"❌ Đã xảy ra lỗi: {str(e)}"
    
    def reset_session(self):
        """Reset chat session"""
        self.chat_session = None