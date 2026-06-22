# 00 — Implementation Plan (the exam answer in one document)

> Read this first if you want the **what / why / how** in 4 pages.
> Then drill into `01-architecture.md` … `06-security.md` for detail.

## A. Problem framing

SentinelGrid must protect six categories of national critical infrastructure
(energy, transport, finance, healthcare, telecoms, government). The DevOps
challenge is not "build a webapp" — it is to build a platform that:

1. ingests **billions of security events daily** without dropping any,
2. correlates and distributes **actionable intelligence** to participating organizations,
3. continues operating through **coordinated attacks, regional outages, and insider abuse**, and
4. proves all of the above to **government auditors and during live simulations**.

Every choice below is justified by one of those four pressures.

---

## B. End-to-end architecture (one paragraph)

A **multi-region, active/warm-standby AWS deployment** provisioned entirely by
**Terraform**. Each region runs an **EKS cluster** with three node groups
(system, app, ingest) hosting **six microservices** packaged as **Docker
images**. State lives in **RDS PostgreSQL Multi-AZ**, **MSK (Kafka)**, and
**Elasticsearch**, all with **cross-region replication**. **Jenkins** drives
CI/CD on ephemeral Kubernetes agents — every image is **scanned (Trivy)** and
**signed (cosign)** before reaching the cluster, where **Kyverno** denies
unsigned images. Runtime secrets come from a **HashiCorp Vault HA cluster**
(Raft + KMS auto-unseal) using **Kubernetes auth + dynamic database
credentials**. Observability is **Prometheus + Grafana + Alertmanager**
(metrics) and the **ELK stack** with **Filebeat DaemonSet** (logs); both export
to immutable S3 (**Object Lock COMPLIANCE**) for forensic durability.
**Route53 health-checked failover** + **Velero K8s backups** + **RDS PITR**
deliver an **RTO of 30 minutes and RPO of 5 minutes**.

---

## C. Mapping case-study requirement → concrete deliverable

| Requirement                       | What we delivered                                           | Where in the repo |
|-----------------------------------|--------------------------------------------------------------|---|
| Infrastructure Automation         | Terraform modules + two prod environments                    | `terraform/` |
| Containerization                  | Multi-stage distroless Dockerfiles for 6 services            | `docker/`, `applications/` |
| Container Orchestration           | EKS + Kustomize overlays, HPA, NetworkPolicy, PDB, Argo Rollouts | `kubernetes/` |
| CI/CD                             | Declarative Jenkinsfile + K8s agent pod + shared library     | `jenkins/` |
| Monitoring                        | Prometheus scrape + alert rules + Grafana dashboards         | `monitoring/` |
| Centralized Logging               | Filebeat → Logstash (GeoIP/MITRE enrich) → Elasticsearch ILM → Kibana | `logging/` |
| Security / Secrets                | Vault HA + policies + K8s auth + dynamic DB creds + PKI      | `vault/` |
| Resilience / DR                   | Multi-region warm standby + runbooks + chaos scripts         | `disaster-recovery/`, `scripts/chaos/` |
| Documentation                     | Six structured docs + per-runbook markdown                   | `docs/`, `disaster-recovery/runbooks/` |

---

## D. Phased delivery plan (what we'd do in week-by-week order)

| Week | Milestone | Definition of done |
|---|---|---|
| 1 | Foundation — AWS accounts, SSO, Terraform state, KMS, audit bucket | `terraform apply` of `terraform/global` succeeds; audit bucket WORM verified |
| 2 | Network + EKS in primary region | EKS reachable, IRSA working, ALB controller installed |
| 3 | Data services — RDS, MSK, Elasticsearch | All endpoints reachable from cluster; encryption-in-transit verified |
| 4 | Vault HA cluster + policies + K8s auth | Pod with `vault-agent-inject` annotation can read a dynamic Postgres cred |
| 5 | Monitoring + logging stacks | Grafana shows pod metrics; Kibana shows enriched logs; alerts fire to Slack |
| 6 | Microservice containers + Jenkins pipeline | Push to `main` deploys a service to staging within 10 min |
| 7 | Canary rollouts + admission policies (Kyverno) | Unsigned image deploy rejected; SLO breach auto-rolls back canary |
| 8 | DR region build + cross-region replication | DR cluster shows live tail of primary's data; replication lag dashboarded |
| 9 | First live failover drill | RTO ≤ 30 min, RPO ≤ 5 min on the clock |
| 10 | Chaos game-days + runbook hardening | All 10 game-day scenarios green; each has a runbook |
| 11 | Penetration test + finding remediation | No HIGH/CRITICAL open |
| 12 | Final evaluation rehearsal | Simulated DDoS, ransomware, insider, regional outage — all pass |

---

## E. Why each tool was picked over alternatives

| Tool | Why this, not the alternative |
|---|---|
| **EKS** over self-managed K8s | Managed control plane removes a known-hard reliability problem; IRSA simplifies identity. |
| **Terraform** over CloudFormation | Multi-cloud portability + better module ecosystem + Atlantis review workflow. |
| **Jenkins** over GitHub Actions | Sovereign hosting requirement for a national-security platform; we own the runners. |
| **Vault** over AWS Secrets Manager | Dynamic credentials, PKI, transit encryption — beyond what Secrets Manager offers; portable to GovCloud later. |
| **Prometheus + ELK** over CloudWatch only | Open standards, no per-log ingest cost surprises, sovereign data possession. |
| **Kafka (MSK)** over SQS | Replay-ability is critical for forensic re-analysis after a missed detection. |
| **Distroless** over Alpine | No package manager, no shell — drastically smaller attack surface. |
| **Argo Rollouts** over plain Deployment | Automated, metrics-gated canary; explicit rollback on SLO breach. |
| **Kyverno** over OPA Gatekeeper | YAML-native policies, image-signature verification built in. |

---

## F. How we meet each "final evaluation" scenario

| Scenario | Defense path |
|---|---|
| Coordinated DDoS | CloudFront + AWS Shield Advanced + WAF rate rules + Kong limits + HPA scale-out + ingest queue absorbs burst |
| Infrastructure failures (AZ/node) | Multi-AZ EKS + PDB + topology spread; Cluster Autoscaler reshuffles workloads |
| Communication outages | Kafka durable + idempotent producers + at-least-once consumers + DLQ + Temporal retries |
| Insider threats | Vault audit + immutable S3 + dual-control PR review + dynamic creds with 1-hour TTL |
| Ransomware | Object Lock COMPLIANCE on backups; cosign image verification at admission; runbook-driven response |
| Regional cloud disruption | Route53 health-checked failover to warm DR cluster; RDS cross-region replica promoted; MirrorMaker keeps Kafka in sync |

---

## G. What a viva examiner will probe — pre-prepared answers

1. **"Why warm standby and not active-active?"**
   Active-active for a stateful ingest pipeline requires cross-region consensus
   on event ordering, which is expensive and adds latency. Warm standby with
   tested 30-minute RTO meets the stated SLO at materially lower cost and
   complexity, while leaving a clear upgrade path to active-active once
   cross-region Kafka mirroring matures.

2. **"How do you prevent a compromised CI from pushing a bad image?"**
   Three independent gates: (a) Trivy fails the build on HIGH/CRITICAL, (b)
   cosign-signed images only (key stored in Vault, accessed via Jenkins K8s
   service account), (c) Kyverno admission policy in the cluster rejects any
   image whose signature it can't verify against the public verification key.

3. **"What happens if Vault itself is unavailable?"**
   The Vault Agent sidecar caches the most recent valid secret with a TTL.
   New pods cannot start (intentional — we refuse to run unauthenticated),
   but existing pods continue running until their cached lease expires (≤ 1 h
   for DB creds). A `VaultSealed` alert pages within 60 s.

4. **"How do you prove no data loss after a regional failover?"**
   Continuous metrics on RDS replica lag, Kafka mirror lag, and ES CCR follower
   stats. The DR readiness pre-flight (`check-dr-readiness.sh`) blocks the
   failover if any of those exceed 60 s. After failover, a reconciliation job
   diffs Kafka offsets between regions and re-publishes any gap from S3 tiered
   storage.

5. **"How is this audit-defensible?"**
   Every CI run, every kubectl call, every Vault read, every login appears
   in the audit S3 bucket which is Object Lock COMPLIANCE-protected and
   cross-region replicated. Even an account-level root user cannot delete
   these records during the retention period.
