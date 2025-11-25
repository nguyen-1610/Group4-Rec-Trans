import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
    WEATHER_API_KEY = os.getenv('OPENWEATHER_API_KEY')
    DATABASE_PATH = 'data/transport.db'
    DEBUG = True