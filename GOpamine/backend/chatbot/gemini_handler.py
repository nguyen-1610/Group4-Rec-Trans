import google.generativeai as genai
from config import Config

class GeminiBot:
    def __init__(self):
        genai.configure(api_key=Config.GEMINI_API_KEY)
        # Đổi thành gemini-pro
        self.model = genai.GenerativeModel('models/gemini-2.5-flash')
    
    def chat(self, message, context=None):
        try:
            if context:
                full_prompt = f"{context}\n\nUser: {message}"
            else:
                full_prompt = message
            
            response = self.model.generate_content(full_prompt)
            
            if response and hasattr(response, 'text'):
                return response.text
            else:
                return "Xin lỗi, tôi không thể tạo phản hồi."
                
        except Exception as e:
            print(f"Gemini error: {str(e)}")
            return f"Lỗi khi gọi Gemini: {str(e)}"