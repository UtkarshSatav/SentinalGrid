# 02 — Infrastructure (Terraform)

## 2.1 Layout

```
terraform/
├── global/                  ← remote state bootstrap (one-time)
├── modules/
│   ├── vpc/                 ← 3-AZ VPC, NAT GW per AZ, flow logs, VPC endpoints
│   ├── eks/                 ← EKS + 3 node groups, IRSA, KMS envelope encryption
│   ├── rds/                 ← PostgreSQL Multi-AZ, PITR 35 d, IAM auth
│   ├── msk/                 ← Kafka cluster (3 brokers, TLS+IAM)
│   ├── s3/                  ← intel + audit (Object Lock) + Velero buckets
│   ├── iam/                 ← reusable role bundles
│   └── kms/                 ← customer-managed keys + rotation
└── environments/
    ├── prod-primary/        ← us-east-1 composition
    └── prod-dr/             ← us-west-2 composition (warm standby)
```

## 2.2 Apply order (first-time bootstrap)

```bash
# 1. State backend (one-time, manual)
cd terraform/global && terraform init && terraform apply

# 2. Primary region
cd terraform/environments/prod-primary
terraform init && terraform plan -out plan.bin && terraform apply plan.bin

# 3. DR region (depends on primary outputs for RDS replica + MSK MirrorMaker config)
cd terraform/environments/prod-dr
terraform init && terraform apply
```

Total cold-build wall-clock: ~45 min (EKS control plane is the longest single step at ~12 min).

## 2.3 Day-2 operations

- All changes via PR, plan output posted as a PR comment by Atlantis.
- `terraform apply` is automated for the `terraform/` directory only after PR merge + manual approval in the Atlantis UI.
- Drift detection runs hourly via a Jenkins cron job; non-zero diff pages the platform team.
- State files are encrypted with a KMS CMK, versioned, locked via DynamoDB.

## 2.4 Cost guard-rails

- All resources tagged with `Project`, `Environment`, `Owner`, `Compliance` (enforced by an AWS Organizations SCP).
- `aws-nuke` runs nightly in any account not tagged `Environment=prod`.
- Budget alarms at 80% / 100% / 120% of monthly forecast, paging finance + platform.
