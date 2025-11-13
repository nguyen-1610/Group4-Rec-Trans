import sqlite3
from datetime import datetime

# Kết nối database (nếu chưa có sẽ tự tạo)
def get_connection():
    conn = sqlite3.connect("data/gopamine.db", check_same_thread=False)
    return conn

# Khởi tạo các bảng khi khởi động app
def init_db():
    conn = get_connection()
    c = conn.cursor()

    # Bảng người dùng
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Bảng phản hồi
    c.execute("""
    CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        comment TEXT,
        image_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Bảng hành trình (tùy chọn)
    c.execute("""
    CREATE TABLE IF NOT EXISTS itineraries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        prompt TEXT,
        ai_response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    conn.close()

# ========== USERS ==========
def add_user(username, password):
    conn = get_connection()
    c = conn.cursor()
    try:
        c.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, password))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def verify_user(username, password):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE username=? AND password=?", (username, password))
    result = c.fetchone()
    conn.close()
    return result is not None

# ========== FEEDBACK ==========
def add_feedback(username, comment, image_path):
    conn = get_connection()
    c = conn.cursor()
    c.execute("INSERT INTO feedback (username, comment, image_path) VALUES (?, ?, ?)",
              (username, comment, image_path))
    conn.commit()
    conn.close()

def get_feedbacks():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT username, comment, image_path, created_at FROM feedback ORDER BY created_at DESC")
    data = c.fetchall()
    conn.close()
    return data

# ========== ITINERARIES ==========
def save_itinerary(username, prompt, ai_response):
    conn = get_connection()
    c = conn.cursor()
    c.execute("INSERT INTO itineraries (username, prompt, ai_response) VALUES (?, ?, ?)",
              (username, prompt, ai_response))
    conn.commit()
    conn.close()

def get_itineraries(username):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT prompt, ai_response, created_at FROM itineraries WHERE username=? ORDER BY created_at DESC", (username,))
    data = c.fetchall()
    conn.close()
    return data
