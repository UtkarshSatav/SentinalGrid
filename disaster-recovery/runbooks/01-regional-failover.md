# Runbook 01 — Regional Failover (Primary → DR)

> **When to invoke:** primary region (us-east-1) is fully or partially unavailable
> AND the issue cannot be mitigated within 15 minutes by AZ-level controls.
>
> **Decision authority:** SRE on-call commander + Security on-call (dual auth).
> Document the decision in the incident channel before executing.

## 0. Pre-flight (60 seconds)

```bash
# Confirm scope: is primary really down or is this a partial blip?
aws health describe-events --region us-east-1 --filter 'eventStatusCodes=open'
curl -fsS https://status.aws.amazon.com/  # external check, not just AWS-side
./scripts/deploy/check-dr-readiness.sh    # validates DR cluster + data replication lag
```

DR readiness gates that MUST be green before failover:
- RDS replica lag < 60 s
- MSK MirrorMaker lag < 30 s
- Elasticsearch CCR `following_index` healthy
- S3 audit-bucket replication metric > 99%
- EKS DR cluster nodes Ready, kube-apiserver responsive

## 1. Declare incident

```bash
./scripts/incident/declare.sh \
  --severity sev1 \
  --title  "Regional failover us-east-1 → us-west-2" \
  --commander "$USER"
```

This opens the bridge, pages the security on-call, and starts the audit trail.

## 2. Stop traffic to primary

```bash
# Route53 weighted record: shift primary weight 100→0
aws route53 change-resource-record-sets \
  --hosted-zone-id Z__SENTINELGRID__ \
  --change-batch file://disaster-recovery/scripts/route53-failover-to-dr.json
```

ACM cert is the same in both regions (multi-region issued cert).
WAF rules are replicated by config-as-code.

## 3. Promote DR data plane

```bash
# 3a. Promote RDS replica → standalone primary
aws rds promote-read-replica \
  --db-instance-identifier sentinelgrid-dr-replica \
  --backup-retention-period 35 \
  --region us-west-2

# 3b. Stop Kafka MirrorMaker (it'll be reversed once primary returns)
kubectl -n sg-platform scale deploy/mirror-maker --replicas=0

# 3c. Promote Elasticsearch following indices → leaders
curl -X POST "https://es.dr.sentinelgrid.internal:9200/_ccr/_pause_follow" -u admin
curl -X POST "https://es.dr.sentinelgrid.internal:9200/_ccr/_unfollow"
```

## 4. Scale DR cluster to full capacity

```bash
aws eks update-nodegroup-config --cluster-name sentinelgrid-dr \
  --nodegroup-name sentinelgrid-dr-app --scaling-config minSize=6,desiredSize=12,maxSize=30
aws eks update-nodegroup-config --cluster-name sentinelgrid-dr \
  --nodegroup-name sentinelgrid-dr-ingest --scaling-config minSize=4,desiredSize=8,maxSize=50

kubectl --context dr scale deploy --all -n sg-apps --replicas=6
```

## 5. Update application config

Apps need to point at the DR endpoints. Vault holds a `region` template; KV is regional already. Trigger a rolling restart so pods pull fresh DB creds (now pointing at promoted RDS):

```bash
kubectl --context dr -n sg-apps rollout restart deploy
kubectl --context dr -n sg-apps rollout status deploy --timeout=10m
```

## 6. Validate end-to-end

```bash
./scripts/deploy/smoke-test.sh dr-prod
./scripts/deploy/synthetic-events.sh --count 100 --target dr
```

Watch the Grafana **Platform Overview** dashboard (DR region selector). Acceptance:
- 5xx rate < 0.1% for 5 minutes
- p99 ingestion latency < 750 ms (slightly higher than primary, expected)
- Consumer lag returning to baseline within 10 minutes

## 7. Communicate

- Update https://status.sentinelgrid.gov to "operating from DR region".
- Notify partner orgs via the published incident-comms channel.
- File the post-incident review template (`./disaster-recovery/runbooks/templates/pir.md`).

## 8. Reverse direction (when primary returns)

See [`02-failback.md`](02-failback.md). Do NOT failback during business hours unless explicitly required.

---

### SLAs

| Metric | Target | How measured |
|---|---|---|
| RTO (recovery time) | ≤ 30 min | Wall clock from decision → traffic served from DR |
| RPO (data loss)     | ≤ 5 min  | Max(RDS replica lag, Kafka mirror lag) at promotion |
| Validation         | < 10 min | Smoke + synthetic checks must pass before "all clear" |
