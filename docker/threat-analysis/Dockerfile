# Threat-analysis: correlates raw events with MITRE ATT&CK + severity scoring.
FROM python:3.12-slim AS builder
WORKDIR /build
COPY applications/threat-analysis/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
RUN useradd --system --uid 1001 appuser
COPY --from=builder /install /usr/local
COPY applications/threat-analysis/src ./src
USER appuser
ENV PYTHONUNBUFFERED=1 PYTHONPATH=/app PORT=8081 \
    KAFKA_BROKERS=redpanda:9092 KAFKA_SECURITY_PROTOCOL=PLAINTEXT
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8081/healthz').status==200 else 1)"]
ENTRYPOINT ["python", "-m", "src.consumer"]
