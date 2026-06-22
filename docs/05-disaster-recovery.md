# 05 — Disaster Recovery

## 5.1 Topology recap

```
Primary  us-east-1  ────►  DR  us-west-2  (warm standby)
RDS PG    Multi-AZ  ────►  Cross-region read replica
MSK       3 brokers ────►  MirrorMaker 2 (active-passive topic mirror)
Elastic   primary   ────►  CCR follower indices
S3 intel  versioned ────►  CRR mirror
S3 audit  Object Lock + CRR (COMPLIANCE)
EKS       full size ────►  EKS warm cluster (min capacity, can scale to full in < 10 min)
```

## 5.2 SLAs

| Class | Description | RPO | RTO |
|---|---|---|---|
| **Tier 0** — ingestion pipeline | event loss is unacceptable | ≤ 5 min | ≤ 30 min |
| **Tier 1** — operator console   | brief downtime tolerable | ≤ 15 min | ≤ 60 min |
| **Tier 2** — analytics / reports | best-effort | ≤ 1 h    | ≤ 4 h    |

## 5.3 Backup matrix

| Data | Mechanism | Frequency | Retention | Restore tested |
|---|---|---|---|---|
| RDS PostgreSQL  | AWS automated backup + PITR + cross-region replica | continuous | 35 d | monthly drill |
| Kafka topics    | MirrorMaker 2 + tiered storage (S3) | continuous | 14 d | quarterly drill |
| Elasticsearch   | Searchable snapshot to S3 (`sg-s3-snapshots`) | hourly | 90 d | monthly |
| Kubernetes state| Velero → S3 (Object Lock) | daily + on-change | 90 d | quarterly |
| Threat-intel S3 | Versioning + CRR | continuous | indefinite | annually |
| Audit logs      | Object Lock COMPLIANCE | immutable | 7 years | annually (read-only) |

## 5.4 Runbooks (in `disaster-recovery/runbooks/`)

- `01-regional-failover.md` — primary → DR cutover
- `02-ransomware-response.md` — contain / eradicate / recover
- `03-insider-threat.md` — identity suspension + secret rotation
- `04-az-failure.md` — single-AZ loss, no failover needed
- `05-kafka-cluster-loss.md` — MSK rebuild + replay from S3 tier
- `06-vault-recovery.md` — auto-unseal failure / Raft quorum loss
- `07-failback.md` — DR → primary reversal

## 5.5 Validation cadence

| Exercise | Frequency | Scope | Owner |
|---|---|---|---|
| Backup restore drill | monthly | One Tier-0 service | SRE |
| Game-day chaos       | weekly  | Staging only | SRE |
| Full regional failover (live) | semi-annually | Production | Platform leadership |
| Tabletop (ransomware/insider) | quarterly | All on-call | Security |
