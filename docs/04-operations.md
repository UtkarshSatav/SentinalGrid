# 04 — Operations: Monitoring, Logging, On-call

## 4.1 The three pillars

| Pillar | Tool | What we collect |
|---|---|---|
| Metrics | Prometheus + Grafana | RED + USE for every service; SLO burn rate; AWS infra metrics via CloudWatch exporter |
| Logs    | Filebeat → Logstash → Elasticsearch → Kibana | All container stdout/stderr (JSON-structured); enriched with GeoIP + MITRE mapping |
| Traces  | OpenTelemetry Collector → Tempo (Grafana) | All HTTP + Kafka spans; 100% sampling for SOC events, 5% for everything else |

## 4.2 SLOs (per service)

| Service              | Availability | Latency p99 |
|----------------------|--------------|-------------|
| api-gateway          | 99.95%       | 200 ms      |
| threat-ingestion     | 99.9%        | 500 ms      |
| intel-distribution   | 99.95%       | 300 ms      |
| threat-analysis      | 99.5% async completion w/in 60 s | — |

Burn rate alerts: 14.4× over 1 h (page) and 6× over 6 h (ticket) — Google SRE multi-window.

## 4.3 On-call structure

- **Primary SRE on-call** — pages for platform availability, SLO burn, infra alerts.
- **Security on-call (SOC)** — pages for security signals (auth failures, WAF, Vault, Falco).
- **Engineer-of-the-week** — owns the prod release train + paging for service-specific business alerts.

## 4.4 Runbooks live next to the alerts

Every alert has a `runbook` annotation pointing at a markdown file checked into `disaster-recovery/runbooks/`. New alerts without a runbook are rejected at PR time by a CI lint job.

## 4.5 Chaos engineering

`scripts/chaos/` contains weekly game-day scenarios run against staging:

- AZ failure (network partition via toxiproxy)
- Pod kill at random (Litmus)
- Disk-pressure injection
- Vault seal
- Kafka broker termination

Failures in chaos drive new alerts or runbook updates.

## 4.6 Audit & compliance

- All kubectl + Vault + Jenkins audit logs land in the immutable S3 audit bucket (Object Lock COMPLIANCE, 7-year retention).
- VPC flow logs + CloudTrail → same bucket.
- Quarterly auditor access uses a temporary IAM role with read-only on the audit bucket, time-bound via SSO assignment.
