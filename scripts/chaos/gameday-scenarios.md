# Weekly Game-Day Scenarios (staging only)

| # | Scenario | Tool | Expected MTTR | What we're testing |
|---|---|---|---|---|
| 1 | Kill all pods of one service       | `kubectl delete pod -l app=<svc>` | < 30 s   | Pod restart + readiness probes |
| 2 | Cordon + drain one node            | `kubectl drain`         | < 2 min  | PDB + topologySpreadConstraints |
| 3 | Network partition between AZs      | Toxiproxy iptables      | < 5 min  | Multi-AZ resilience |
| 4 | Vault seal                         | `vault operator seal`   | < 5 min  | KMS auto-unseal kicks in |
| 5 | Kafka broker termination           | `aws msk reboot-broker` | < 3 min  | min.insync.replicas + producer retries |
| 6 | RDS failover                       | `aws rds reboot-db-instance --force-failover` | < 60 s | Multi-AZ failover |
| 7 | Inject latency in api-gateway      | Litmus chaos `pod-network-latency` | n/a (degraded) | SLO burn alerts fire |
| 8 | Fill disk on one node              | `dd if=/dev/zero` (privileged debug pod) | < 2 min | Pod eviction + reschedule |
| 9 | Revoke an IAM role mid-flight      | IAM policy update       | < 1 hr (dynamic creds rotate hourly) | Vault cred rotation |
| 10| Full region kill (DR drill)        | Route53 + EKS pause     | < 30 min | Full DR runbook |

Each finding becomes either (a) a new Prometheus alert rule, (b) a runbook update, or (c) a code fix tracked as a ticket. Game-day owner rotates weekly.
