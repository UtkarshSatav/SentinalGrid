# syntax=docker/dockerfile:1.7
# Threat-ingestion: FastAPI service publishing partner events to Kafka.
# ────────── builder ──────────
FROM python:3.12-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
COPY applications/threat-ingestion/requirements.txt .
# Install deps into an isolated prefix we can copy wholesale into the runtime.
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ────────── runtime ──────────
FROM python:3.12-slim
WORKDIR /app
RUN useradd --system --uid 1001 appuser
COPY --from=builder /install /usr/local
COPY applications/threat-ingestion/src ./src
USER appuser
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app PORT=8080 \
    KAFKA_BROKERS=redpanda:9092 KAFKA_SECURITY_PROTOCOL=PLAINTEXT
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/healthz').status==200 else 1)"]
ENTRYPOINT ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
