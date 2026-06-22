# Data Flow — Ingestion to Distribution

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontSize':'13px'}}}%%
sequenceDiagram
    autonumber
    participant P as Partner Org
    participant CF as CloudFront + WAF
    participant K as Kong + OPA
    participant TI as threat-ingestion
    participant KA as Kafka<br/>(raw-events)
    participant TA as threat-analysis
    participant DB as PostgreSQL
    participant ES as Elasticsearch
    participant IC as incident-coordination
    participant ID as intel-distribution
    participant SUB as Subscribing Orgs

    P->>+CF: POST /v1/events<br/>mTLS + signed payload
    CF->>CF: WAF rule check<br/>Shield DDoS scrub
    CF->>+K: forward (TLS 1.3)
    K->>K: OAuth/JWT verify<br/>OPA policy
    K->>K: Per-org rate-limit
    K->>+TI: route
    TI->>TI: schema validate<br/>signature verify<br/>dedupe (SHA-256)
    TI->>KA: produce (acks=all,<br/>idempotent)
    TI-->>-K: 202 Accepted
    K-->>-CF: 202
    CF-->>-P: 202

    Note over KA,TA: Async pipeline

    KA->>+TA: consume<br/>(consumer group)
    TA->>TA: enrich: GeoIP +<br/>MITRE ATT&CK +<br/>reputation cache
    TA->>TA: ML risk score
    TA->>DB: persist incident
    TA->>ES: index event
    TA->>IC: emit "scored event"
    deactivate TA

    IC->>IC: match playbook
    IC->>IC: Temporal workflow:<br/>page on-call +<br/>notify partner +<br/>auto-block IOC
    IC->>+ID: publish IOC
    ID->>ID: format as<br/>STIX 2.1
    ID->>SUB: TAXII 2.1 feed
    deactivate ID
```

## Why this shape

- **Synchronous boundary stops at Kong** → ingestion stays low-latency even under load
- **Kafka is the durability boundary** → if downstream is broken, events are replayable
- **Temporal handles long-running incidents** → retries, timers, human approvals all checkpointed
- **STIX/TAXII is the industry-standard feed format** → partners integrate with off-the-shelf tooling
