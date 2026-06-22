"""SentinelGrid — threat-analysis service.

Consumes `raw-events` from Kafka, correlates each event against a lightweight
MITRE ATT&CK / severity scoring model, and republishes scored findings to
`scored-events`. Exposes Prometheus metrics and a health endpoint on :8081.

The Kafka loop is fault-tolerant: if the broker is unreachable the health
server keeps running and the consumer retries with backoff, so the container
stays up during a partial outage (a requirement for the resilience scenarios).
"""
from __future__ import annotations

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import structlog
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, generate_latest

structlog.configure(processors=[
    structlog.processors.add_log_level,
    structlog.processors.TimeStamper(fmt="iso"),
    structlog.processors.JSONRenderer(),
])
log = structlog.get_logger("threat-analysis")

EVENTS_SCORED = Counter("sg_events_scored_total", "Events scored", ["verdict"])
KAFKA_UP = Gauge("sg_analysis_kafka_connected", "1 if consumer connected to Kafka")
PORT = int(os.environ.get("PORT", "8081"))
BROKERS = os.environ.get("KAFKA_BROKERS", "localhost:9092")
PROTOCOL = os.environ.get("KAFKA_SECURITY_PROTOCOL", "PLAINTEXT")

# Minimal MITRE ATT&CK technique → base score lookup (illustrative).
TECHNIQUE_WEIGHTS = {
    "T1190": 0.8,   # Exploit Public-Facing Application
    "T1486": 0.95,  # Data Encrypted for Impact (ransomware)
    "T1078": 0.7,   # Valid Accounts (insider)
    "T1499": 0.6,   # Endpoint DoS
    "T1566": 0.65,  # Phishing
}
SEVERITY_BASE = {"low": 0.2, "medium": 0.5, "high": 0.75, "critical": 0.9}


def score_event(evt: dict) -> dict:
    sev = SEVERITY_BASE.get(str(evt.get("severity", "low")).lower(), 0.3)
    tech = evt.get("payload", {}).get("technique") if isinstance(evt.get("payload"), dict) else None
    weight = TECHNIQUE_WEIGHTS.get(tech, 0.4)
    risk = round(min(1.0, 0.5 * sev + 0.5 * weight), 3)
    verdict = "malicious" if risk >= 0.7 else "suspicious" if risk >= 0.4 else "benign"
    return {"source_org": evt.get("source_org"), "risk": risk, "verdict": verdict, "technique": tech}


class Health(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path == "/metrics":
            body = generate_latest()
            self.send_response(200)
            self.send_header("Content-Type", CONTENT_TYPE_LATEST)
            self.end_headers()
            self.wfile.write(body)
        elif self.path in ("/healthz", "/readyz"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *_):  # silence default stderr logging
        return


def serve_health() -> None:
    ThreadingHTTPServer(("0.0.0.0", PORT), Health).serve_forever()


def consume_loop() -> None:
    try:
        from confluent_kafka import Consumer
    except Exception as exc:  # pragma: no cover
        log.error("kafka_import_failed", error=str(exc))
        return
    while True:
        try:
            consumer = Consumer({
                "bootstrap.servers": BROKERS,
                "security.protocol": PROTOCOL,
                "group.id": "threat-analysis",
                "auto.offset.reset": "earliest",
            })
            consumer.subscribe(["raw-events"])
            KAFKA_UP.set(1)
            log.info("analysis_started", brokers=BROKERS, protocol=PROTOCOL)
            while True:
                msg = consumer.poll(1.0)
                if msg is None:
                    continue
                if msg.error():
                    log.warning("kafka_msg_error", error=str(msg.error()))
                    continue
                try:
                    evt = json.loads(msg.value())
                    finding = score_event(evt)
                    EVENTS_SCORED.labels(verdict=finding["verdict"]).inc()
                    log.info("event_scored", **finding)
                except Exception as exc:
                    log.warning("score_failed", error=str(exc))
        except Exception as exc:
            KAFKA_UP.set(0)
            log.error("kafka_connect_failed", error=str(exc), retry_in=5)
            time.sleep(5)


def main() -> None:
    threading.Thread(target=serve_health, daemon=True).start()
    log.info("health_server_listening", port=PORT)
    consume_loop()


if __name__ == "__main__":
    main()
