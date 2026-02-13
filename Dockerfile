FROM python:3.11-slim

WORKDIR /app

# sadece backend'i kopyala
COPY backend/ ./backend/

# deps
RUN pip install --no-cache-dir -r backend/requirements.txt

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
