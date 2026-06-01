FROM python:3.11-slim

# System deps: ffmpeg for all video work, libgl/libglib for opencv-python-headless mediapipe runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Layer cache: install Python deps first
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App source
COPY . .

# Render injects $PORT at runtime. Bind to it.
ENV PORT=8080 \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    PYTHONUNBUFFERED=1

EXPOSE 8080

# Long-running export jobs need a generous timeout; threads keep status polling responsive.
# `gthread` worker class lets a single worker handle the background-export thread plus the
# concurrent /api/export/status polls without spawning extra heavyweight processes.
CMD ["sh", "-c", "gunicorn -k gthread -w 1 --threads 8 --timeout 900 -b 0.0.0.0:${PORT} app:app"]
