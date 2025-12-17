# Sử dụng Python làm base
FROM python:3.10-slim

# Thiết lập thư mục làm việc
WORKDIR /app

# Copy và cài đặt dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ code
COPY . .

# Mở cổng (Render sẽ tự map cổng này)
EXPOSE 10000

# LỆNH CHẠY QUAN TRỌNG: Không dùng ngoặc vuông []
ENTRYPOINT ["sh", "-c"]
CMD ["sh", "-c", "gunicorn --workers 1 --timeout 120 --bind 0.0.0.0:${PORT} backend.app:app"]

