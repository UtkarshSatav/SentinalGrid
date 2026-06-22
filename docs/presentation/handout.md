# SentinelGrid — One-Page Viva Handout

**Case Study 94 · DevOps for National Cyber Defense · Multi-region cloud-native platform**

---

## What it does
Ingests **billions of security events/day** from partner orgs across **6 critical-infrastructure sectors**, correlates and scores threats, and distributes actionable intelligence as **STIX/TAXII feeds**. Survives DDoS, AZ failure, ransomware, insider abuse, and full regional outage.

## Architecture in 60 seconds
**Two AWS regions** (active us-east-1, warm us-west-2). Each runs **EKS** with 3 node groups (system, app, ingest). **Six microservices**: `threat-ingestion` → `threat-analysis` → `intel-distribution`, plus `incident-coordination`, `api-gateway` (Kong + OPA), `dashboard-ui`. State: **RDS PostgreSQL Multi-AZ**, **MSK Kafka**, **Elasticsearch**, **S3 with Object Lock**. All wired with **continuous cross-region replication**.

## DevOps tooling — case-study requirements mapped 1:1

| Requirement | Tool | Key detail |
|---|---|---|
| Infrastructure Automation | **Terraform** | Modules + 2 envs + remote state (S3 + DynamoDB lock) |
| Containerization | **Docker** | Multi-stage, distroless, non-root, signed with cosign |
| Orchestration | **Kubernetes (EKS)** | HPA, KEDA (Kafka lag), PDB, NetworkPolicy, Argo Rollouts |
| CI/CD | **Jenkins** | Ephemeral K8s agents, 12-stage pipeline, canary rollouts |
| Monitoring | **Prometheus + Grafana** | SLO multi-window burn-rate alerts → PagerDuty |
| Logging | **ELK + Filebeat** | Logstash enriches with GeoIP + MITRE ATT&CK; ILM hot/warm/cold |
| Security / Secrets | **HashiCorp Vault** | HA Raft + KMS auto-unseal, K8s auth, dynamic DB creds, PKI mTLS |
| Resilience / DR | Velero + Route 53 + Object Lock | **RPO 5 min · RTO 30 min**, semi-annual live drills |

## Three independent gates against bad releases
1. **Trivy** image scan — fail on HIGH/CRITICAL
2. **cosign signature + Kyverno admission** — cluster refuses unsigned images
3. **Argo Rollouts + SLO burn-rate guard** — canary auto-rollback on regression

## Why each major choice
- **Warm standby** (not active-active): meets 30-min RTO at materially lower cost, no cross-region consensus headaches.
- **Vault** over Secrets Manager: dynamic creds + PKI + transit; portable to GovCloud.
- **Jenkins** over GitHub Actions: sovereign hosting; we own the runners.
- **Distroless**: no shell, no package manager → minimal attack surface.
- **S3 Object Lock COMPLIANCE**: backups and audit logs cannot be deleted even by root → ransomware-proof and audit-defensible.

## Final evaluation scenarios

| Threat | Defense | SLA |
|---|---|---|
| Coordinated DDoS | Shield Adv + WAF + HPA | <60 s |
| Node / AZ failure | PDB + topology spread + Autoscaler | <5 min |
| Regional outage | Route 53 failover to DR | **30 min RTO** |
| Insider threat | Vault audit + dual-control + 1-h dynamic creds | trail preserved |
| Ransomware | Object Lock + cosign admission + RDS PITR | <2 hr restore |
| Comm outage | Kafka durable + idempotent + Temporal retries | zero loss |

## Deliverable
**52 files · 65 directories** at `/Users/utkarsh/Documents/SEM-4 S-2/SentinelGrid/`
Read order: `README.md` → `docs/00-implementation-plan.md` → `docs/01-architecture.md` … `06-security.md` → runbooks in `disaster-recovery/runbooks/`.
