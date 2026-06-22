"""SentinelGrid — synthetic load generator.

Continuously exercises the real platform so the Grafana dashboards have live data:
  - POSTs a burst of security events to threat-ingestion every few seconds
    (these flow through Kafka and are scored by threat-analysis),
  - pulls the TAXII intel feed from intel-distribution,
  - opens and advances incidents in incident-coordination.

Pure standard library (urllib) so it needs no build and no dependencies.
Runs as a container in docker-compose; restart: unless-stopped keeps it alive.
"""
from __future__ import annotations

import json
import os
import random
import time
import urllib.request

INGEST = os.environ.get("INGEST_URL", "http://threat-ingestion:8080")
INTEL = os.environ.get("INTEL_URL", "http://intel-distribution:8082")
INCIDENT = os.environ.get("INCIDENT_URL", "http://incident-coordination:8083")
INTERVAL = float(os.environ.get("INTERVAL_SECONDS", "3"))

ORGS = ["AtlantaWater", "GridCo", "VeritasMed", "FedPay", "DefenseMinistry",
        "MetroTransit", "NorthernTelecom", "CapitalBank"]
SEVERITIES = ["low", "medium", "high", "critical"]
# MITRE ATT&CK techniques the analysis service knows how to weight.
TECHNIQUES = ["T1190", "T1486", "T1078", "T1499", "T1566"]
INCIDENT_TYPES = ["ransomware", "insider", "ddos", "default"]


def post(url: str, body: dict) -> dict | None:
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read() or b"{}")
    except Exception as exc:  # service may still be booting — keep going
        print(f"[load] POST {url} failed: {exc}", flush=True)
        return None


def get(url: str) -> None:
    try:
        urllib.request.urlopen(url, timeout=5).read()
    except Exception as exc:
        print(f"[load] GET {url} failed: {exc}", flush=True)


def main() -> None:
    print(f"[load] starting — feeding {INGEST} every {INTERVAL}s", flush=True)
    open_incidents: list[str] = []
    tick = 0
    while True:
        tick += 1

        # 1) Burst of 2–6 security events through the ingestion pipeline.
        for _ in range(random.randint(2, 6)):
            evt = {
                "source_org": random.choice(ORGS),
                "event_type": "alert",
                "severity": random.choice(SEVERITIES),
                "occurred_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "payload": {"technique": random.choice(TECHNIQUES)},
                "signature": f"sig-{tick}-{random.randint(0, 1_000_000)}",
            }
            post(f"{INGEST}/v1/events", evt)

        # 2) Pull the TAXII intel feed every ~4th tick.
        if tick % 4 == 0:
            get(f"{INTEL}/taxii2/api/collections/indicators/objects/")

        # 3) Open a new incident every ~3rd tick. Only resolve (advance) when we
        #    hold more than ~8 open, so "Active incidents" stays visibly non-zero.
        if tick % 3 == 0:
            inc = post(f"{INCIDENT}/v1/incidents",
                       {"type": random.choice(INCIDENT_TYPES),
                        "source_org": random.choice(ORGS)})
            if inc and inc.get("id"):
                open_incidents.append(inc["id"])
        if len(open_incidents) > 8:
            iid = random.choice(open_incidents)
            res = post(f"{INCIDENT}/v1/incidents/{iid}/advance", {})
            if res and res.get("status") == "resolved":
                open_incidents.remove(iid)

        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
