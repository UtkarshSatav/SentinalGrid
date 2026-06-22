# Runbook 02 — Ransomware / Destructive Malware Response

> **Scope:** suspicious encryption activity, mass deletion, or extortion note
> detected anywhere in the SentinelGrid platform.

## Phase 1 — Contain (target: 5 min)

1. **Network isolation** — apply emergency NetworkPolicy denying all egress
   from the affected namespace; preserve forensic state.
   ```bash
   kubectl apply -f disaster-recovery/scripts/emergency-isolation.yaml
   ```

2. **Revoke credentials**:
   ```bash
   vault token revoke -mode=path /
   aws iam update-access-key --status Inactive --access-key-id <id>
   ```

3. **Snapshot before any change** — RDS, EBS volumes attached to suspect nodes:
   ```bash
   ./disaster-recovery/scripts/forensic-snapshot.sh --target <pod|node|db>
   ```

## Phase 2 — Eradicate (target: 30 min)

4. Identify the entry vector via the SOC Kibana space (`sg-soc-events-*`).
   Look for: new ServiceAccount tokens, unexpected ECR pulls, anomalous Vault paths.

5. Rotate ALL secrets that could have been exposed:
   ```bash
   ./disaster-recovery/scripts/rotate-all-secrets.sh
   ```
   This script:
   - Re-keys Vault transit keys
   - Rotates RDS master password
   - Rotates MSK SASL credentials
   - Forces new dynamic-cred lease for every namespace
   - Rolls all Deployments

6. Quarantine the compromised image SHA in ECR + add to admission-controller deny-list.

## Phase 3 — Recover (target: 2 hr)

7. Restore data from immutable backups:
   - **RDS** → PITR to T-5min before suspected compromise time
     ```bash
     aws rds restore-db-instance-to-point-in-time \
       --source-db-instance-identifier sentinelgrid-primary \
       --target-db-instance-identifier sentinelgrid-primary-restored \
       --restore-time 2024-XX-XXTXX:XX:XXZ
     ```
   - **Kubernetes state** → Velero restore from S3 (Object-Lock protected)
     ```bash
     velero restore create --from-backup sg-daily-<DATE> --include-namespaces sg-apps
     ```
   - **Threat-intel S3 bucket** → versioned restore via `aws s3api restore-object`

8. Re-deploy from known-good image tag (last green release in audit bucket):
   ```bash
   LAST_GOOD=$(aws s3 cp s3://sentinelgrid-primary-audit/pipelines/main/last-green - | jq -r .image_tag)
   ./scripts/deploy/redeploy.sh --tag "$LAST_GOOD"
   ```

## Phase 4 — Post-incident (within 5 business days)

- Forensic timeline using audit-bucket logs (immutable, COMPLIANCE mode lock).
- Tabletop with all stakeholders.
- File a CSIRT report to the national cyber authority.
- Update detections in Falco / Prometheus alert rules to catch similar patterns earlier.

---

### Why this works for SentinelGrid

- **Velero backups land in S3 Object Lock COMPLIANCE mode** — cannot be deleted or overwritten even by root for the retention period.
- **RDS PITR** gives second-granularity restore for up to 35 days.
- **Audit bucket** is cross-region replicated and write-once, so the forensic trail survives the incident.
- **Vault dynamic credentials** mean stolen DB creds expire in ≤ 1 hour anyway, limiting blast radius.
