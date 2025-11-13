# 🚌 GOPamine - Bus Route Management System

Hệ thống quản lý thông tin tuyến xe buýt TP.HCM với AI chatbot (Gemini) và bản đồ (OpenStreetMap).

---

## 📁 Cấu trúc Project

```
GOPamine/
├── assets/              # Hình ảnh, icons, fonts
├── backend/
│   ├── BE/             # Business Logic
│   │   ├── AI.py                  # Chatbot Gemini
│   │   ├── app.py                 # Flask app chính
│   │   ├── feedback.py            # Xử lý feedback
│   │   ├── form.py                # Form validation
│   │   ├── home.py                # Routes trang chủ
│   │   ├── login.py               # Authentication
│   │   ├── Map_Trans.py           # Bản đồ OpenStreetMap
│   │   └── weather.py             # API thời tiết
│   ├── data/
│   │   └── gopamine.db            # SQLite database
│   └── utils/
│       ├── ai_utils.py            # AI helpers
│       └── database.py            # Database CRUD
├── frontend/
│   ├── pages/                     # HTML pages
│   ├── static/                    # CSS, JS, images
│   └── templates/                 # templates (menu, header, footer)
├── .gitignore						# để các file thực thi kh lên
├── README.md						
└── requirements.txt				# thư viện cần tải
```

---

## 📂 Giải thích Files

### Backend (BE)

| File 			| Chức năng |
|------			|-----------|
| `AI.py` 		| Chatbot dùng Gemini API, xử lý NLP |
| `app.py` 		| Flask app chính, đăng ký routes, config |
| `feedback.py` | Nhận và xử lý feedback người dùng |
| `form.py` 	| Validation forms với WTForms |
| `home.py` 	| Routes cho trang chủ, danh sách tuyến |
| `login.py` 	| Đăng nhập, đăng ký, session |
| `Map_Trans.py`| Render bản đồ OSM, tính tuyến đường |
| `weather.py` 	| Lấy thông tin thời tiết TP.HCM |

### Data

| File | Chức năng |
|------|-----------|
| `gopamine.db` | SQLite database chứa: routes, stops, users, feedbacks |

### Utils

| File | Chức năng |
|------|-----------|
| `ai_utils.py` | Helper functions cho AI (format response, extract data) |
| `database.py` | CRUD operations, queries, init database |

### Frontend

| Folder | Chức năng |
|--------|-----------|
| `pages/` | HTML tĩnh (about, guide, faq) |
| `static/` | CSS, JS, images |
| `templates/` | Jinja2 templates (base, home, login, map, v.v.) |

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

