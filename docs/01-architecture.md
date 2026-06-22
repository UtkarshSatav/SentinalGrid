# 01 — System Architecture

## 1.1 Design Principles

1. **Defense in depth** — every layer (network, host, container, application, data) has independent controls.
2. **Zero implicit trust** — mTLS between services, short-lived dynamic credentials from Vault, NetworkPolicies deny-by-default.
3. **Stateless compute, stateful data** — all microservices are stateless; state lives in RDS, Elasticsearch, S3, Kafka.
4. **Region-active, region-recoverable** — primary region handles 100% live traffic; DR region runs warm standby with continuous data replication.
5. **Everything as code** — infra (Terraform), config (Helm + Kustomize), pipelines (Jenkinsfile), policies (OPA, Vault HCL), runbooks (markdown + scripts).
6. **Observable by default** — every service emits structured logs (JSON), Prometheus metrics on `/metrics`, OpenTelemetry traces.

---

## 1.2 High-Level Architecture (ASCII)

```
                              ┌──────────────────────────┐
                              │   Route 53 (DNS, health  │
                              │   checks, failover)      │
                              └────────────┬─────────────┘
                                           │
                       ┌───────────────────┴───────────────────┐
                       │                                       │
            ┌──────────▼──────────┐                 ┌──────────▼──────────┐
            │  PRIMARY REGION     │                 │  DR REGION          │
            │  us-east-1          │                 │  us-west-2          │
            │                     │                 │   (warm standby)    │
            │  ┌───────────────┐  │                 │  ┌───────────────┐  │
            │  │  CloudFront + │  │                 │  │  CloudFront + │  │
            │  │  WAF + Shield │  │                 │  │  WAF + Shield │  │
            │  └───────┬───────┘  │                 │  └───────┬───────┘  │
            │          │          │                 │          │          │
            │  ┌───────▼───────┐  │   replicate    │  ┌───────▼───────┐  │
            │  │ ALB / NLB     │  │  ◄─────────►   │  │ ALB / NLB     │  │
            │  └───────┬───────┘  │                 │  └───────┬───────┘  │
            │          │          │                 │          │          │
            │  ┌───────▼───────────────────┐        │  ┌───────▼─────────┐│
            │  │   EKS Cluster (3 AZs)     │        │  │   EKS Cluster   ││
            │  │  ┌─────────────────────┐  │        │  │   (warm, min    ││
            │  │  │ Node Group: system  │  │        │  │    capacity)    ││
            │  │  │ (Vault, ELK, Prom)  │  │        │  └─────────────────┘│
            │  │  ├─────────────────────┤  │        │                     │
            │  │  │ Node Group: app     │  │        │                     │
            │  │  │ (6 microservices)   │  │        │                     │
            │  │  ├─────────────────────┤  │        │                     │
            │  │  │ Node Group: ingest  │  │        │                     │
            │  │  │ (Kafka consumers)   │  │        │                     │
            │  │  └─────────────────────┘  │        │                     │
            │  └───────┬───────────────────┘        │                     │
            │          │                            │                     │
            │  ┌───────▼───────────┐                │ ┌──────────────┐    │
            │  │ MSK (Kafka)       │  mirror-maker  │ │ MSK (Kafka)  │    │
            │  └───────┬───────────┘  ◄──────────►  │ └──────┬───────┘    │
            │          │                            │        │            │
            │  ┌───────▼───────────┐  read replica  │ ┌──────▼───────┐    │
            │  │ RDS PostgreSQL    │  ◄──────────►  │ │ RDS (replica)│    │
            │  │ Multi-AZ          │                │ └──────────────┘    │
            │  └───────────────────┘                │                     │
            │                                       │                     │
            │  ┌───────────────────┐  cross-region  │ ┌──────────────┐    │
            │  │ Elasticsearch     │  CCR           │ │ Elasticsearch│    │
            │  └───────────────────┘  ◄──────────►  │ └──────────────┘    │
            │                                       │                     │
            │  ┌───────────────────┐  CRR           │ ┌──────────────┐    │
            │  │ S3 (threat intel, │  ◄──────────►  │ │ S3 (mirror)  │    │
            │  │ audit, backups)   │                │ └──────────────┘    │
            │  └───────────────────┘                │                     │
            └───────────────────────┘                └─────────────────────┘
```

---

## 1.3 Network Topology (per region)

| Layer | CIDR | Purpose |
|---|---|---|
| VPC | `10.0.0.0/16` (primary), `10.1.0.0/16` (DR) | Isolated tenancy |
| Public subnets (×3) | `10.0.0.0/24`, `10.0.1.0/24`, `10.0.2.0/24` | NAT GW, ALB |
| Private app subnets (×3) | `10.0.10.0/24`, `10.0.11.0/24`, `10.0.12.0/24` | EKS worker nodes |
| Private data subnets (×3) | `10.0.20.0/24`, `10.0.21.0/24`, `10.0.22.0/24` | RDS, MSK, Elasticsearch, ElastiCache |

- **VPC Flow Logs** to CloudWatch + S3.
- **Transit Gateway** between regions for private replication traffic.
- **VPC Endpoints** for S3, ECR, STS, Secrets Manager, KMS — no traffic over public internet.

---

## 1.4 Data Flow — Ingestion to Distribution

```
Partner Org
   │  (1) HTTPS POST /v1/events  (mTLS, signed payload)
   ▼
CloudFront ──► WAF ──► ALB ──► Kong API Gateway ──► OPA policy check
                                                          │
                                                          ▼
                                            threat-ingestion-service
                                                          │  (2) validate, dedupe
                                                          ▼
                                                   Kafka topic: raw-events
                                                          │
                                                          ▼
                                              threat-analysis-service
                                          (correlate, enrich w/ MITRE ATT&CK,
                                           GeoIP, reputation feeds, ML scoring)
                                                          │
                                       ┌──────────────────┼──────────────────┐
                                       ▼                  ▼                  ▼
                              Kafka: scored-events    PostgreSQL       Elasticsearch
                                       │           (incidents table)   (events index)
                                       ▼
                         incident-coordination-service
                          (Temporal workflows, playbooks,
                            paging via PagerDuty)
                                       │
                                       ▼
                         intel-distribution-service
                       (STIX 2.1 / TAXII 2.1 endpoint
                        published to subscribing orgs)
```

---

## 1.5 Tooling Map (case-study requirements → implementation)

| Requirement | Tool | Where in repo |
|---|---|---|
| Infrastructure Automation | Terraform | `terraform/` |
| Containerization | Docker (multi-stage, distroless) | `docker/` |
| Orchestration | Kubernetes (EKS) | `kubernetes/` |
| CI/CD | Jenkins (declarative pipelines) | `jenkins/` |
| Monitoring | Prometheus + Grafana + Alertmanager | `monitoring/` |
| Centralized Logging | ELK (Elasticsearch + Logstash + Kibana) + Filebeat | `logging/` |
| Secrets / Security | HashiCorp Vault (Raft HA, KMS auto-unseal) | `vault/` |
| Resilience / DR | Multi-region, Velero, RDS CRR, MSK Mirror-Maker, Route53 failover | `disaster-recovery/` |

---

## 1.6 Identity & Access

- **Human ops**: AWS SSO → IAM Roles Anywhere → kubectl via `aws-iam-authenticator` → RBAC.
- **Service-to-AWS**: IRSA (IAM Roles for Service Accounts) — no static keys on pods.
- **Service-to-Service inside cluster**: Vault-issued mTLS certs (rotated every 24 h).
- **Service-to-DB**: Vault dynamic DB credentials (TTL 1 h, max 24 h).

---

## 1.7 SLO Targets

| Service | Availability | Latency p99 | Error budget / month |
|---|---|---|---|
| `api-gateway` | 99.95% | 200 ms | 21.9 min |
| `threat-ingestion` | 99.9% | 500 ms | 43.8 min |
| `threat-analysis` (async) | 99.5% completion w/in 60 s | — | — |
| `intel-distribution` | 99.95% | 300 ms | 21.9 min |

Burn-rate alerts fire at 2% / 1 h and 5% / 6 h windows (Google SRE multi-window strategy).
