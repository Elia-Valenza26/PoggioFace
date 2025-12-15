# InsightFace API Service
# Supporta sia GPU (CUDA) che CPU

FROM python:3.11-slim

# Installa dipendenze sistema per OpenCV e InsightFace
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia requirements e installa dipendenze Python
COPY requirements.txt .

# Per CPU-only, sostituisci onnxruntime-gpu con onnxruntime
RUN pip install --no-cache-dir -r requirements.txt

# Crea directory per dati persistenti
RUN mkdir -p /app/data /app/models

# Copia il codice dell'applicazione
COPY app.py .

# Esponi porta API
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')" || exit 1

# Avvia l'applicazione
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
