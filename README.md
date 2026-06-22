# Project SentinelGrid — National Cyber Defense Platform

> **Case Study 94 — DevOps Implementation**
> A multi-region, cloud-native, fully-automated DevOps ecosystem for ingesting,
> analyzing, and distributing cyber threat intelligence at national scale.

---

## 1. One-Page Solution Summary

| Concern | Solution |
|---|---|
| **Cloud / IaC** | AWS multi-region (Primary: `us-east-1`, DR: `us-west-2`), provisioned end-to-end with **Terraform** modules and remote state in S3 + DynamoDB lock. |
| **Containers** | Six microservices packaged as **Docker** images, signed and stored in Amazon ECR. Multi-stage builds, distroless runtime, non-root user. |
| **Orchestration** | **Kubernetes (EKS)** with three node groups (system, app, ingest-stream), HPA + Cluster Autoscaler, PodDisruptionBudgets, anti-affinity, network policies. |
| **CI/CD** | **Jenkins** master + ephemeral Kubernetes agents. Multibranch declarative pipelines: lint → unit → SAST → build → image scan (Trivy) → deploy via Helm → smoke tests → progressive rollout. |
| **Monitoring** | **Prometheus + Alertmanager + Grafana**. Federated Prometheus across both regions, blackbox probes, USE+RED dashboards, SLO burn-rate alerts. |
| **Logging** | **ELK Stack** — Filebeat DaemonSet → Logstash (enrichment + GeoIP for threat events) → Elasticsearch (hot-warm-cold ILM) → Kibana with role-scoped spaces. |
| **Secrets / Security** | **HashiCorp Vault** HA cluster on Raft, auto-unseal via AWS KMS, Kubernetes auth method, dynamic DB credentials, PKI engine for mTLS. |
| **Resilience** | Active/warm-standby across two AWS regions. Route53 health-checked failover. RDS Multi-AZ + cross-region read replica. Velero for K8s state backups. RPO ≤ 5 min, RTO ≤ 30 min. |

---

## 1a. Run the whole platform locally (Docker)

> **Full step-by-step instructions, credentials, and troubleshooting:
> [`SETUP.md`](SETUP.md).**

The AWS topology above is the production target. For demonstration/evaluation, the
entire platform also runs on a laptop via Docker Compose — all six microservices, a
Kafka broker, the API gateway, and the Prometheus + Grafana monitoring plane:

```bash
docker compose build      # build all 6 service images
docker compose up -d      # start the full stack (9 containers)
docker compose ps         # all healthy

# Endpoints
open http://localhost:3000          # SOC operator dashboard (Next.js)
open http://localhost:8000          # API gateway (Kong) → routes to services
open http://localhost:9090/targets  # Prometheus (6 targets up)
open http://localhost:3001          # Grafana (admin / sentinelgrid)
```

A live build/run verification (containers, ports, end-to-end event pipeline, UI
screenshots) is recorded in [`docs/09-review-and-verification.md`](docs/09-review-and-verification.md).

---

## 2. Repository Layout

```
SentinelGrid/
├── README.md                          ← you are here
├── docs/                              ← architecture, deployment, ops, DR, security
├── terraform/                         ← AWS infra-as-code (modules + environments)
├── docker/                            ← Dockerfiles per microservice
├── kubernetes/                        ← K8s manifests (Kustomize overlays)
├── jenkins/                           ← Jenkinsfiles + shared library
├── monitoring/                        ← Prometheus rules, Grafana dashboards, Alertmanager
├── logging/                           ← ELK pipelines, Filebeat config
├── vault/                             ← Vault policies, config, init scripts
├── disaster-recovery/                 ← DR runbooks + backup/restore scripts
├── scripts/                           ← bootstrap, deploy, chaos-eng helpers
├── applications/                      ← microservice source (all 6 implemented)
└── docker-compose.yml                 ← runnable local stack (build & up)
```

---

## 3. Six Microservices (the "SentinelGrid" platform itself)

| Service | Purpose | Stack |
|---|---|---|
| `threat-ingestion`     | Ingest raw security events from partner orgs via REST + Kafka | Python FastAPI + Kafka producer |
| `threat-analysis`      | Correlate, enrich, score threats; emit IOCs | Python + Spark Streaming |
| `intel-distribution`   | Publish STIX/TAXII feeds to participating organizations | Go |
| `incident-coordination`| Workflow engine for incident response playbooks | Node.js + Temporal |
| `api-gateway`          | AuthN/Z, rate-limit, route to internal services | Kong + OPA |
| `dashboard-ui`         | Operator SOC console | React + TypeScript |

---

## 4. How to Read This Deliverable

1. **Start with [`docs/01-architecture.md`](docs/01-architecture.md)** — full system architecture, data flow, network topology.
2. **Then [`docs/02-infrastructure.md`](docs/02-infrastructure.md)** — Terraform module guide and apply order.
3. **Then [`docs/03-deployment.md`](docs/03-deployment.md)** — CI/CD pipeline walkthrough and Helm deployment model.
4. **Then [`docs/04-operations.md`](docs/04-operations.md)** — monitoring, logging, on-call practices.
5. **Then [`docs/05-disaster-recovery.md`](docs/05-disaster-recovery.md)** — failover procedures and recovery validation.
6. **Then [`docs/06-security.md`](docs/06-security.md)** — Vault, secrets, network policies, compliance posture.

---

## 5. Quick Start (Local Demo)

```bash
# 1. Provision infra (primary region)
cd terraform/environments/prod-primary
terraform init && terraform apply

# 2. Configure kubectl
aws eks update-kubeconfig --name sentinelgrid-primary --region us-east-1

# 3. Bootstrap cluster (Vault, monitoring, logging, ingress)
./scripts/bootstrap/install-platform.sh

# 4. Deploy applications via Jenkins
# (push to main branch — pipeline runs automatically)

# 5. Validate end-to-end
./scripts/deploy/smoke-test.sh
```

---

## 6. Final-Evaluation Resilience Matrix

| Simulated Scenario | Defense Mechanism | Recovery SLA |
|---|---|---|
| Coordinated DDoS | AWS Shield Advanced + Kong rate-limit + HPA scale-out | < 60s detection |
| Node failure | Cluster Autoscaler + PDB + pod anti-affinity | < 90s reschedule |
| AZ outage | Multi-AZ EKS node groups + RDS Multi-AZ | < 5 min |
| **Regional outage** | **Route53 failover → DR region (us-west-2)** | **RTO 30 min / RPO 5 min** |
| Insider threat | Vault audit log + IAM least-privilege + RBAC + immutable S3 audit bucket | Forensic trail preserved |
| Ransomware | Velero immutable backups + RDS PITR + S3 Object Lock | < 2 hr full restore |
| Communication outage | Kafka durable queues + dead-letter topics + Temporal retries | Zero event loss |

See [`disaster-recovery/runbooks/`](disaster-recovery/runbooks/) for step-by-step procedures.
# SentinalGrid
