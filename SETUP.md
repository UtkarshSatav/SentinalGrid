# SentinelGrid — Setup & Run Guide

This guide walks you through building and running the **entire SentinelGrid platform
locally** with Docker, verifying it end‑to‑end, and viewing live data in Grafana.

The production target is AWS (Terraform + EKS + MSK + Vault + ELK — see `terraform/`,
`kubernetes/`, `vault/`, `logging/`). This guide covers the **runnable local stack**
defined in `docker-compose.yml`, which is the equivalent for demonstration/evaluation.

---

## 1. Prerequisites

| Tool | Version used | Notes |
|------|--------------|-------|
| Docker Desktop | 4.67+ (Engine 29.x) | Must be running (`docker version` should show a Server section) |
| Docker Compose | v2 (bundled) | `docker compose version` |
| Free disk | ~4 GB | For 6 service images + Kafka/Prometheus/Grafana |
| Free RAM | ~4 GB | Kafka + 9 containers |

Free TCP ports on the host: **3000, 3001, 8000, 8001, 8080, 8081, 8082, 8083, 9090, 19092**.

> No Node/Python/Go toolchains are needed on your machine — everything builds **inside Docker**.

---

## 2. Quick start (TL;DR)

```bash
cd "SentinelGrid"
docker compose build      # build all 6 service images (~2–4 min first time)
docker compose up -d      # start the full stack (10 containers)
docker compose ps         # wait until services show "healthy"
```

Then open:

| URL | What |
|-----|------|
| http://localhost:3000 | **SOC operator dashboard** (Next.js) |
| http://localhost:3001 | **Grafana** — login `admin` / `sentinelgrid` |
| http://localhost:9090/targets | **Prometheus** — all 6 targets `UP` |
| http://localhost:8000 | **API gateway** (Kong) → proxies to services |
| http://localhost:8082/taxii2/api/collections/indicators/objects/ | TAXII/STIX intel feed |

A `load-generator` container feeds synthetic events continuously, so the dashboards
populate on their own within ~30–60 s.

---

## 3. What gets deployed

| Service | Image | Host port | Purpose |
|---------|-------|-----------|---------|
| `dashboard-ui` | Next.js 15 (standalone) | 3000 | SOC operator console (SSR + SQLite) |
| `threat-ingestion` | python:3.12-slim (FastAPI) | 8080 | Accepts partner events → Kafka |
| `threat-analysis` | python:3.12-slim | 8081 | Consumes Kafka, MITRE ATT&CK scoring |
| `intel-distribution` | distroless Go | 8082 | STIX 2.1 / TAXII 2.1 publisher |
| `incident-coordination` | distroless Node | 8083 | Incident playbook orchestration |
| `api-gateway` | kong:3.8 | 8000 / 8001 | Routing + OPA authz + Prometheus plugin |
| `kafka` | apache/kafka 3.8 (KRaft) | 19092 | Event backbone (internal `kafka:9092`) |
| `prometheus` | prom/prometheus | 9090 | Scrapes all service `/metrics` |
| `grafana` | grafana 11 | 3001 | Dashboards (auto-provisioned) |
| `load-generator` | python:3.12-slim | — | Synthetic continuous data feed |

---

## 4. Step-by-step

### 4.1 Build the images
```bash
docker compose build
```
Builds: `dashboard-ui`, `threat-ingestion`, `threat-analysis`, `intel-distribution`,
`incident-coordination`, `api-gateway`. Verify:
```bash
docker images | grep sentinelgrid     # expect 6 images
```

### 4.2 Start the stack
```bash
docker compose up -d
docker compose ps
```
Wait until `kafka`, `threat-ingestion`, `threat-analysis`, `api-gateway`, and
`dashboard-ui` report **(healthy)**. Kafka takes ~30–40 s to become healthy on first boot;
the Kafka-dependent services start only after it does (`depends_on: service_healthy`).

### 4.3 Open the dashboard
Visit **http://localhost:3000**. You should see the *Operations Overview* with metrics,
an event-ingestion chart, recent events, active incidents, and region/Vault/audit status.

### 4.4 Log in to Grafana
Visit **http://localhost:3001** and log in:

- **Username:** `admin`
- **Password:** `sentinelgrid`

Open **Dashboards → SentinelGrid → SentinelGrid — Platform Overview**. Within ~30–60 s the
panels fill with live data fed by the load generator (auto-refresh every 10 s).

---

## 5. Verify it works (end-to-end)

Push events through the real pipeline and confirm they are ingested, sent to Kafka, and
scored by the analysis service:

```bash
# Push 5 events through ingestion (from inside the Docker network)
docker exec sentinelgrid-dashboard-ui-1 node -e '
(async()=>{for(let i=0;i<5;i++){
  const e={source_org:"GridCo",event_type:"alert",severity:"critical",
    occurred_at:new Date().toISOString(),payload:{technique:"T1486"},signature:"t"+i+Date.now()};
  const r=await fetch("http://threat-ingestion:8080/v1/events",{method:"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});
  console.log("POST ->",r.status);
}})();'

# See them scored by threat-analysis
docker logs sentinelgrid-threat-analysis-1 2>&1 | grep event_scored | tail -5

# Confirm Kafka consumer has zero lag (all consumed)
docker exec sentinelgrid-kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group threat-analysis
```

Check Prometheus targets are all up: open **http://localhost:9090/targets** — `api-gateway`,
`incident-coordination`, `intel-distribution`, `prometheus`, `threat-analysis`,
`threat-ingestion` should all be **UP**.

---

## 6. The synthetic load generator

The `load-generator` service runs `scripts/load/feed.py` and continuously:
- POSTs bursts of security events to `threat-ingestion` (→ Kafka → scored),
- pulls the TAXII intel feed,
- opens/advances incidents (holds ~8 active).

Control it:
```bash
docker compose stop load-generator      # pause the data feed (platform keeps running)
docker compose start load-generator     # resume
```
Change the feed rate by editing `INTERVAL_SECONDS` (default `3`) on the `load-generator`
service in `docker-compose.yml`, then `docker compose up -d load-generator`.

---

## 7. Credentials & config reference

| Item | Value | Where set |
|------|-------|-----------|
| Grafana admin | `admin` / `sentinelgrid` | `docker-compose.yml` → `grafana.environment` |
| Kafka brokers (internal) | `kafka:9092` | `threat-ingestion` / `threat-analysis` env |
| Kafka (host access) | `localhost:19092` | `kafka.ports` |
| Prometheus scrape config | `docker/prometheus/prometheus.yml` | mounted read-only |
| Grafana provisioning | `docker/grafana/provisioning/` | datasource + dashboard |
| Dashboard DB | seeded SQLite baked into image | `docker/dashboard-ui/Dockerfile` |

---

## 8. Troubleshooting

**A port is already allocated** (e.g. `Bind for 0.0.0.0:19092 failed`)
Another container/process holds the port. Find and stop it:
```bash
docker ps --filter "publish=19092"
docker compose down --remove-orphans   # clears orphaned containers from old configs
```

**Grafana shows "No data" on every panel (including *Service up*)**
The datasource UID must match the dashboard. It is pinned to `prometheus` in
`docker/grafana/provisioning/datasources/datasource.yml`. If you changed it, recreate
Grafana with a fresh volume:
```bash
docker compose rm -sf grafana && docker volume rm sentinelgrid_grafana-data
docker compose up -d grafana
```

**Grafana password change didn't take effect**
`GF_SECURITY_ADMIN_PASSWORD` is applied only on first boot (data is in a volume). To force:
```bash
docker compose rm -sf grafana && docker volume rm sentinelgrid_grafana-data
docker compose up -d grafana
```

**Kafka won't become healthy / services stuck "waiting"**
Check the broker log: `docker logs sentinelgrid-kafka-1`. Give it 40 s on first boot.
If it exited, ensure no stale `kafka-data` volume from a broken run:
```bash
docker compose down -v && docker compose up -d
```

**`threat-analysis` shows Kafka connection errors briefly**
Normal during Kafka startup; it retries with backoff and the container stays up. Confirm
recovery with `docker logs sentinelgrid-threat-analysis-1 | grep analysis_started`.

**Dashboard UI 502/connection refused right after `up`**
The Next.js server needs a few seconds to boot. Wait for `dashboard-ui` to show `(healthy)`.

---

## 9. Stop & clean up

```bash
docker compose stop          # stop containers, keep them and volumes
docker compose down          # remove containers + network (keeps named volumes)
docker compose down -v       # remove containers + network + volumes (full reset)
```

Remove the built images too:
```bash
docker images --format '{{.Repository}}:{{.Tag}}' | grep '^sentinelgrid/' | xargs docker rmi
```

---

## 10. Rebuilding after code changes

```bash
docker compose build <service>     # rebuild one service, e.g. threat-ingestion
docker compose up -d <service>     # recreate it with the new image
```
The `load-generator` and Grafana/Prometheus configs are mounted, so changes to
`scripts/load/feed.py`, `docker/prometheus/prometheus.yml`, or the Grafana provisioning
files take effect on a `restart` of that service (Grafana datasource/dashboard changes
re-provision on container start).

---

## 11. Related documentation

| Doc | Contents |
|-----|----------|
| `README.md` | One-page solution summary + repo layout |
| `docs/01-architecture.md` | System architecture |
| `docs/03-deployment.md` | CI/CD pipeline & deployment strategy |
| `docs/04-operations.md` | Monitoring, logging, on-call |
| `docs/05-disaster-recovery.md` | DR strategy & SLAs |
| `docs/06-security.md` | Threat model, Vault, controls |
| `docs/09-review-and-verification.md` | Build/run verification evidence |
| `disaster-recovery/runbooks/` | Failover, ransomware, insider-threat runbooks |
