import type {
  ThreatEvent, Incident, InfraComponent, PlatformMetrics, IntelSubscriber,
  Severity, Sector,
} from "./types";

// ── Deterministic PRNG so reloads are stable ────────────────────────────────
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
const pick = <T,>(arr: readonly T[], rnd: () => number) => arr[Math.floor(rnd() * arr.length)];

const ORGS = [
  "NorthGrid Power", "PacificRail", "MetroBank", "Sentinel Health",
  "OmegaTelecom", "DefenseMinistry", "AtlantaWater", "FedPay Network",
  "VeritasMed", "AeroPort Authority",
] as const;

const SECTORS: readonly Sector[] = [
  "Energy", "Transport", "Finance", "Healthcare", "Telecom", "Government",
];

const EVENT_TYPES = [
  "anomalous_login", "lateral_movement", "data_exfiltration", "ransomware_signature",
  "privilege_escalation", "c2_beacon", "credential_stuffing", "supply_chain_anomaly",
  "ddos_burst", "insider_access_violation",
];

const MITRE = [
  "T1078 — Valid Accounts", "T1059 — Command Execution", "T1486 — Data Encrypted for Impact",
  "T1071 — Application Layer Protocol", "T1110 — Brute Force", "T1190 — Exploit Public App",
  "T1021 — Remote Services", "T1567 — Exfil over Web Service",
];

const COUNTRIES = ["RU", "CN", "KP", "IR", "BR", "VN", "RO", "TR", "BY", "NG"];

const SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low"];
const SEV_WEIGHTS = [0.05, 0.2, 0.45, 0.3]; // weighted draw

function weightedSeverity(rnd: () => number): Severity {
  const r = rnd();
  let acc = 0;
  for (let i = 0; i < SEVERITIES.length; i++) {
    acc += SEV_WEIGHTS[i];
    if (r < acc) return SEVERITIES[i];
  }
  return "low";
}

export function generateEvents(count = 60, seed = 42): ThreatEvent[] {
  const rnd = seeded(seed);
  const now = Date.now();
  return Array.from({ length: count }).map((_, i) => {
    const sev = weightedSeverity(rnd);
    return {
      id: `evt_${(now - i * 1500).toString(36)}_${i.toString(36)}`,
      timestamp: new Date(now - i * 1500 - Math.floor(rnd() * 8000)).toISOString(),
      sourceOrg: pick(ORGS, rnd),
      sector: pick(SECTORS, rnd),
      eventType: pick(EVENT_TYPES, rnd),
      severity: sev,
      srcIp: `${Math.floor(rnd()*223)+1}.${Math.floor(rnd()*255)}.${Math.floor(rnd()*255)}.${Math.floor(rnd()*254)+1}`,
      srcCountry: pick(COUNTRIES, rnd),
      mitreTechnique: pick(MITRE, rnd),
      reputation: rnd() < 0.6 ? "suspicious" : rnd() < 0.85 ? "malicious" : "clean",
      status: rnd() < 0.7 ? "analyzed" : rnd() < 0.9 ? "actioned" : "ingested",
    };
  });
}

const PLAYBOOKS = [
  "Ransomware Containment v3",
  "Lateral Movement Quarantine",
  "C2 Beacon Severance",
  "Mass Credential Reset",
  "DDoS Edge Mitigation",
  "Insider Access Revocation",
];

export function generateIncidents(count = 14, seed = 99): Incident[] {
  const rnd = seeded(seed);
  const now = Date.now();
  const states: Incident["status"][] = ["open", "investigating", "contained", "resolved"];
  return Array.from({ length: count }).map((_, i) => {
    const sev = weightedSeverity(rnd);
    const totalSteps = 4 + Math.floor(rnd() * 3);
    const status = pick(states, rnd);
    const doneCount =
      status === "resolved"      ? totalSteps :
      status === "contained"     ? Math.max(1, totalSteps - 1) :
      status === "investigating" ? Math.floor(totalSteps / 2) :
                                   1;
    const stepNames = [
      "Detect & triage", "Isolate affected hosts", "Rotate credentials",
      "Apply playbook", "Notify partners", "Forensic snapshot", "Recovery validation",
    ];
    const steps = Array.from({ length: totalSteps }).map((_, k) => ({
      name: stepNames[k % stepNames.length],
      state: (k < doneCount ? "done"
            : k === doneCount ? (rnd() < 0.15 ? "failed" : "running")
            : "pending") as "done" | "running" | "pending" | "failed",
    }));
    return {
      id: `INC-${(2300 + i).toString().padStart(4, "0")}`,
      title: `${pick(EVENT_TYPES, rnd).replace(/_/g, " ")} at ${pick(ORGS, rnd)}`,
      sector: pick(SECTORS, rnd),
      severity: sev,
      status,
      createdAt: new Date(now - i * 1000 * 60 * (5 + Math.floor(rnd() * 40))).toISOString(),
      assignee: pick(["a.patel", "j.osei", "m.kowalski", "s.tanaka", "r.gomez"], rnd),
      playbook: pick(PLAYBOOKS, rnd),
      steps,
      affectedAssets: 1 + Math.floor(rnd() * 80),
    };
  });
}

export function generateInfra(): InfraComponent[] {
  return [
    { name: "EKS sentinelgrid-primary",  region: "us-east-1", type: "EKS",           status: "healthy",  detail: "39 nodes · 312 pods · CPU 62%" },
    { name: "EKS sentinelgrid-dr",       region: "us-west-2", type: "EKS",           status: "healthy",  detail: "12 nodes (warm) · 94 pods · CPU 28%" },
    { name: "RDS primary",               region: "us-east-1", type: "RDS",           status: "healthy",  detail: "Multi-AZ · r6i.2xlarge · 412 GB" },
    { name: "RDS DR replica",            region: "us-west-2", type: "RDS",           status: "healthy",  detail: "Read replica · replication lag 2.1s", replicationLagSec: 2.1 },
    { name: "MSK Kafka",                 region: "us-east-1", type: "MSK",           status: "degraded", detail: "Broker 2 elevated I/O wait" },
    { name: "MSK MirrorMaker2",          region: "us-west-2", type: "MSK",           status: "healthy",  detail: "Mirror lag 0.7s", replicationLagSec: 0.7 },
    { name: "Elasticsearch hot tier",    region: "us-east-1", type: "Elasticsearch", status: "healthy",  detail: "Green · 18 nodes · 4.2 TB" },
    { name: "Elasticsearch CCR follower",region: "us-west-2", type: "Elasticsearch", status: "healthy",  detail: "Follow lag 1.4s", replicationLagSec: 1.4 },
    { name: "Vault HA",                  region: "us-east-1", type: "Vault",         status: "healthy",  detail: "Unsealed · Raft leader vault-1" },
    { name: "S3 audit (Object Lock)",    region: "us-east-1", type: "S3",            status: "healthy",  detail: "COMPLIANCE mode · CRR 99.99%" },
  ];
}

export function getMetrics(): PlatformMetrics {
  return {
    eventsPerSecond:        14_287,
    eventsLast24h:          1_234_800_000,
    activeIncidents:        14,
    subscribingOrgs:        212,
    iocsPublished24h:       38_412,
    p99IngestionMs:         184,
    errorBudgetRemaining:   78.4,
    vaultSealed:            false,
    primaryRegion:          "healthy",
    drRegion:               "healthy",
    replicationLagSec:      2.1,
  };
}

export function generateSubscribers(): IntelSubscriber[] {
  return ORGS.slice(0, 8).map((org, i) => ({
    org,
    sector: SECTORS[i % SECTORS.length],
    feedFormat: i % 2 === 0 ? "STIX 2.1" : "TAXII 2.1",
    iocsDelivered24h: 1200 + Math.floor((i + 1) * 487),
    lastPullAt: new Date(Date.now() - i * 1000 * 60 * 3).toISOString(),
  }));
}

// 24-hour event-rate sparkline (for the overview chart)
export function generateEventRateSeries(): { t: string; eps: number }[] {
  const rnd = seeded(7);
  const now = Date.now();
  return Array.from({ length: 96 }).map((_, i) => {
    const idx = 95 - i;
    const baseline = 13000 + Math.sin(idx / 8) * 1800;
    const noise = (rnd() - 0.5) * 1400;
    const spike = idx === 12 || idx === 13 ? 6000 : 0;
    return {
      t: new Date(now - idx * 15 * 60 * 1000).toISOString(),
      eps: Math.max(0, Math.round(baseline + noise + spike)),
    };
  });
}
