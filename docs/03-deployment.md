# 03 — Deployment Model

## 3.1 Pipeline summary

```
git push ─► Jenkins webhook ─► Pipeline (declarative)
   │
   ├── 1. Lint + SAST (semgrep, gitleaks)
   ├── 2. Unit tests + coverage gate (≥ 80%)
   ├── 3. Build image (Kaniko, no Docker daemon)
   ├── 4. Scan image (Trivy: fail on HIGH/CRITICAL)
   ├── 5. Sign image (cosign, key from Vault)
   ├── 6. Push to ECR
   ├── 7. Deploy → staging (kustomize apply)
   ├── 8. Smoke test staging
   ├── 9. Manual approval gate (SRE / Platform lead)
   ├── 10. Progressive rollout prod (Argo Rollouts: 10 → 50 → 100%)
   ├── 11. SLO burn-rate guard (auto-pause + rollback on regression)
   └── 12. Immutable audit record to S3
```

## 3.2 Why this shape

| Concern | How the pipeline addresses it |
|---|---|
| Untrusted image in cluster | Admission webhook (Kyverno) verifies cosign signature; unsigned = denied. |
| Vulnerable base image | Trivy gate breaks the build on HIGH/CRITICAL. Distroless base limits the surface. |
| Bad release reaching users | Canary rollout with automated rollback on SLO breach. |
| Secrets in images / repo | Gitleaks pre-commit + CI. App reads secrets from Vault at runtime, not env vars baked into image. |
| Lost forensic trail | Every pipeline writes an immutable audit record (S3 Object Lock COMPLIANCE). |

## 3.3 Helm vs Kustomize

- **Kustomize** for in-house services — straightforward overlays per env.
- **Helm** only for third-party charts (Prometheus, ELK, Vault, KEDA, Velero).
  Versions pinned; chart values live in `kubernetes/helm-values/`.

## 3.4 Promotion strategy

- `feature/*` branch → CI runs lint + tests + image build, no deploy.
- `main` branch    → CI deploys to staging automatically; prod requires manual approval.
- `release/*` tag  → cuts an immutable image; promotion happens by retagging in ECR, not rebuilding.

## 3.5 Rollback

- **Pre-traffic-shift**: `kubectl argo rollouts abort` reverts to previous stable replicaset.
- **Post-traffic-shift**: `kubectl argo rollouts undo` swaps back to previous version (replicaset is kept for 10 revisions).
- **Database migrations**: forward-only; reversible via shadow tables + dual-write pattern when destructive changes are unavoidable. Migration tooling: `dbmate`, wrapped by Jenkins so a migration is a separate, manually-approved job.
