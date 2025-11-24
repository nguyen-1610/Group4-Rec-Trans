# 🚌 GOPamine - Smart Itinerary & Transport Advisor

---

## 📁 Cấu trúc Project

```
GOPamine/
├── assets/              # Hình ảnh, icons, fonts
├── backend/
│   ├── BE/             # Business Logic
│   ├── data/
│   │   └── gopamine.db            # SQLite database
│   └── utils/
│       ├── ai_utils.py            # AI helpers
│       └── database.py            # Database CRUD
├── frontend/
│   ├── static/                    # CSS, JS, images
│   └── templates/                 # templates (menu, header, footer)
├── .gitignore						# Không push các file quan trọng bí mật lên git
├── README.md						
└── requirements.txt				# thư viện cần tải
```

---

## 🚀 Setup & Run

### 1. Cài đặt

```bash
# Clone project
git clone <repo-url>
cd GOPamine

# Virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt
```

### 2. Cấu hình

Tạo file `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
WEATHER_API_KEY=your_weather_api_key_here
SECRET_KEY=your_secret_key_here
```

### 3. Database

```bash
# Khởi tạo database
python backend/utils/database.py
```

### 4. Chạy

```bash
cd backend/BE
python app.py
```

Truy cập: `http://localhost:5000`

---

## 🔑 API Keys

### Gemini API (FREE)
1. Vào: https://makersuite.google.com/app/apikey
2. Tạo API key
3. Copy vào `.env`

### Weather API (FREE)
1. Vào: https://openweathermap.org/api
2. Đăng ký free tier
3. Copy key vào `.env`

---

## 📦 Dependencies Chính

- **Flask** - Web framework
- **Google Gemini** - AI chatbot (FREE)
- **Folium + OSMnx** - Bản đồ OpenStreetMap
- **Geopy** - Tính toán địa lý
- **SQLite** - Database (built-in Python)
- **Gunicorn** - Production server

---

## 🗄️ Database Schema

**Tables**: `routes`, `stops`, `route_stops`, `users`, `feedbacks`, `search_history`

Xem chi tiết: `backend/utils/database.py`

---

## 📚 API Endpoints

### Routes
- `GET /routes` - Danh sách tuyến
- `GET /routes/<id>` - Chi tiết tuyến
- `POST /routes/search` - Tìm kiếm

### AI
- `POST /ai/chat` - Chat với bot
- `POST /ai/suggest-route` - Gợi ý tuyến

### Map
- `GET /map/render` - Render bản đồ
- `POST /map/calculate-route` - Tính đường đi

---

## ⚠️ Lưu ý

- Gemini API **MIỄN PHÍ** (có rate limit)
- OpenStreetMap **MIỄN PHÍ** (tuân thủ usage policy)
- Không commit `.env` lên Git
- Database là SQLite - phù hợp cho dev/small app

---

## 🤝 Contributing

1. Fork project
2. Tạo branch (`git checkout -b feature/X`)
3. Commit (`git commit -m 'Add X'`)
4. Push (`git push origin feature/X`)
5. Tạo Pull Request

