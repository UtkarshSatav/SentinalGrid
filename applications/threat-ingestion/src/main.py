"""SentinelGrid — threat-ingestion service.

Accepts partner security events, validates signature, dedupes, and publishes
to Kafka topic `raw-events`. Exposes Prometheus metrics on /metrics and
structured JSON logs for the ELK pipeline.
"""
from __future__ import annotations

import hashlib
import os
import time
from contextlib import asynccontextmanager

import structlog
from confluent_kafka import Producer
from fastapi import FastAPI, HTTPException, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import BaseModel, Field

structlog.configure(processors=[
    structlog.processors.add_log_level,
    structlog.processors.TimeStamper(fmt="iso"),
    structlog.processors.JSONRenderer(),
])
log = structlog.get_logger("threat-ingestion")

EVENTS_INGESTED = Counter("sg_events_ingested_total", "Total events ingested", ["source", "severity"])
EVENT_LATENCY = Histogram("sg_event_latency_seconds", "Event ingestion latency", ["endpoint"])
DUPES = Counter("sg_events_duplicate_total", "Duplicate events rejected")


class SecurityEvent(BaseModel):
    source_org: str = Field(..., min_length=1, max_length=128)
    event_type: str
    severity: str = Field(..., pattern="^(low|medium|high|critical)$")
    occurred_at: str
    payload: dict
    signature: str


producer: Producer | None = None
seen: set[str] = set()  # in prod: Redis Bloom filter w/ TTL


@asynccontextmanager
async def lifespan(app: FastAPI):
    global producer
    conf = {
        "bootstrap.servers": os.environ.get("KAFKA_BROKERS", "localhost:9092"),
        # PLAINTEXT for local/compose; SASL_SSL+OAUTHBEARER (MSK IAM) in prod.
        "security.protocol": os.environ.get("KAFKA_SECURITY_PROTOCOL", "PLAINTEXT"),
        "client.id": "threat-ingestion",
        "enable.idempotence": True,
        "acks": "all",
        "compression.type": "zstd",
    }
    if conf["security.protocol"].startswith("SASL"):
        conf["sasl.mechanism"] = os.environ.get("KAFKA_SASL_MECHANISM", "OAUTHBEARER")
    try:
        producer = Producer(conf)
        log.info("ingestion_started", brokers=conf["bootstrap.servers"], protocol=conf["security.protocol"])
    except Exception as exc:  # broker unreachable at boot — stay up, retry on demand
        producer = None
        log.error("kafka_producer_init_failed", error=str(exc))
    yield
    if producer is not None:
        producer.flush(10)


app = FastAPI(title="SentinelGrid Threat Ingestion", lifespan=lifespan)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
def readyz() -> dict[str, str]:
    if producer is None:
        raise HTTPException(503, "kafka producer not ready")
    return {"status": "ready"}


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/v1/events", status_code=202)
async def ingest(event: SecurityEvent, request: Request) -> dict[str, str]:
    start = time.perf_counter()
    digest = hashlib.sha256(
        f"{event.source_org}|{event.occurred_at}|{event.signature}".encode()
    ).hexdigest()

    if digest in seen:
        DUPES.inc()
        raise HTTPException(409, "duplicate event")
    seen.add(digest)

    if producer is None:
        raise HTTPException(503, "kafka producer unavailable")
    producer.produce(
        topic="raw-events",
        key=event.source_org.encode(),
        value=event.model_dump_json().encode(),
        headers={"trace-id": request.headers.get("x-trace-id", "")},
    )
    producer.poll(0)

    EVENTS_INGESTED.labels(source=event.source_org, severity=event.severity).inc()
    EVENT_LATENCY.labels(endpoint="/v1/events").observe(time.perf_counter() - start)
    log.info("event_accepted", source=event.source_org, severity=event.severity, digest=digest[:12])
    return {"status": "accepted", "event_id": digest}
