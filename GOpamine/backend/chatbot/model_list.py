import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv('GEMINI_API_KEY')
print(f"API Key (first 10 chars): {api_key[:10]}...")

genai.configure(api_key=api_key)

print("\n=== DANH SÁCH TÁT CẢ MODELS ===\n")

try:
    models = list(genai.list_models())
    
    if not models:
        print("❌ Không tìm thấy model nào!")
        print("API key có thể không hợp lệ hoặc chưa được kích hoạt.")
    else:
        for m in models:
            print(f"Model: {m.name}")
            print(f"  Supported methods: {m.supported_generation_methods}")
            print()
            
except Exception as e:
    print(f"❌ LỖI: {e}")
    print("\nVui lòng kiểm tra:")
    print("1. API key có đúng không?")
    print("2. API key đã được enable chưa?")
    print("3. Thử tạo API key mới tại: https://aistudio.google.com/app/apikey")