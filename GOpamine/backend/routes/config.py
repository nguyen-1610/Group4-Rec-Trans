import os
from dotenv import load_dotenv

# --- SỬA ĐOẠN LOAD .ENV ---
# Tìm file .env ở thư mục cha (backend) để đảm bảo load được Key
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir) # Lùi lại 1 cấp ra thư mục backend
env_path = os.path.join(backend_dir, '.env')
load_dotenv(env_path)
# --------------------------

class Config:
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
    WEATHER_API_KEY = os.getenv('OPENWEATHER_API_KEY')
    
    # Cấu hình Database mới (PostgreSQL)
    # Thay thế cho DATABASE_PATH = 'data/transport.db' cũ
    DB_HOST = os.getenv('DB_HOST')
    DB_NAME = os.getenv('DB_NAME')
    DB_USER = os.getenv('DB_USER')
    DB_PASSWORD = os.getenv('DB_PASSWORD')
    DB_PORT = os.getenv('DB_PORT')

    DEBUG = True