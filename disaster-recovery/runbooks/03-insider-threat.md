# Runbook 03 — Insider Threat / Credential Compromise

## Indicators
- Vault audit log shows unusual policy attachment
- Kubernetes audit log: privileged role binding by a non-system user
- Out-of-hours `kubectl exec` into a production namespace
- Mass download from threat-intel S3 bucket

## Immediate Actions

1. **Suspend identity** (AWS SSO):
   ```bash
   aws identitystore update-user --identity-store-id <id> --user-id <id> --status DISABLED
   ```

2. **Revoke active Vault tokens** issued to that identity:
   ```bash
   vault list auth/oidc/login | xargs -I{} vault token revoke {}
   ```

3. **Force-rotate any secret that identity could have read** — use the same
   `rotate-all-secrets.sh` script as the ransomware runbook (it's idempotent).

4. **Preserve evidence**: the audit S3 bucket is already WORM (Object Lock
   COMPLIANCE) and cross-region replicated. Take an explicit snapshot of the
   Vault audit index in Elasticsearch:
   ```bash
   ./disaster-recovery/scripts/preserve-vault-audit.sh --window 30d
   ```

5. Forensic interview / HR escalation per organisational policy.

## Why this is hard to abuse

- IAM roles and Vault policies are deployed only through code review on a
  branch-protected repo with two required approvals (one must be security).
- Every kubectl call hits the audit webhook and lands in the immutable bucket
  within seconds.
- Service-to-service trust never relies on human-managed credentials —
  IRSA + Vault dynamic creds + ServiceAccount JWTs are the only paths.
