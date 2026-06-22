# DR Failover — State Machine

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontSize':'13px'}}}%%
stateDiagram-v2
    [*] --> Healthy
    Healthy: PRIMARY active<br/>DR warm standby<br/>continuous replication

    Healthy --> Degraded: AZ failure /<br/>partial outage
    Degraded --> Healthy: AZ recovers<br/>(no failover needed)

    Healthy --> Investigating: Health-check alarm<br/>(region-wide)
    Investigating --> Healthy: false alarm /<br/>resolved < 15 min

    Investigating --> PreFailover: SRE + Security<br/>dual approval
    PreFailover: Pre-flight gates:<br/>• RDS lag < 60s<br/>• Kafka lag < 30s<br/>• ES CCR healthy<br/>• EKS DR ready

    PreFailover --> Failover: All gates green
    PreFailover --> Investigating: Gate failed →<br/>fix before failover

    Failover: 1. Route53 shift to DR<br/>2. Promote RDS replica<br/>3. Stop MirrorMaker<br/>4. Promote ES followers<br/>5. Scale DR EKS

    Failover --> Validating: cutover complete
    Validating: Smoke +<br/>synthetic checks<br/>5xx < 0.1%<br/>p99 < 750ms

    Validating --> RunningOnDR: pass
    Validating --> Failover: retry remediation

    RunningOnDR: DR is now PRIMARY<br/>old primary observed<br/>for recovery

    RunningOnDR --> PreFailback: primary recovered +<br/>data resynced
    PreFailback --> Healthy: reverse replication<br/>flip Route53
```

## RTO / RPO Budget

| Phase | Budget | What it covers |
|---|---|---|
| Detect | 5 min | Health-check + alerting |
| Decide | 5 min | SRE + Security dual approval |
| Execute | 15 min | Route53 + RDS promote + scale-up |
| Validate | 5 min | Smoke + synthetic |
| **Total RTO** | **30 min** | end-to-end recovery |
| **RPO** | **≤ 5 min** | replication lag bound |
