# 1. Chọn môi trường Python (nhẹ và ổn định)
FROM python:3.10-slim

# 2. Thiết lập thư mục làm việc bên trong container
WORKDIR /app

# 3. Copy file requirements từ máy bạn vào container trước
# (Lưu ý đường dẫn backend/requirements.txt dựa trên ảnh bạn gửi)
COPY backend/requirements.txt .

# 4. Cài đặt các thư viện
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 5. Copy toàn bộ code (cả backend lẫn frontend) vào container
COPY . .

# 6. Mở cổng 5000 (cổng mặc định của Flask)
EXPOSE 5000

# 7. Lệnh chạy app khi container khởi động
# Vì app.py nằm trong folder backend, ta phải gọi python backend/app.py
CMD ["python", "backend/app.py"]