export type Severity = "critical" | "high" | "medium" | "low";

export type Sector =
  | "Energy" | "Transport" | "Finance" | "Healthcare" | "Telecom" | "Government";

export interface ThreatEvent {
  id: string;
  timestamp: string;
  sourceOrg: string;
  sector: Sector;
  eventType: string;
  severity: Severity;
  srcIp: string;
  srcCountry: string;
  mitreTechnique: string;
  reputation: "clean" | "suspicious" | "malicious";
  status: "ingested" | "analyzed" | "actioned";
}

export interface Incident {
  id: string;
  title: string;
  sector: Sector;
  severity: Severity;
  status: "open" | "investigating" | "contained" | "resolved";
  createdAt: string;
  assignee: string;
  playbook: string;
  steps: { name: string; state: "done" | "running" | "pending" | "failed" }[];
  affectedAssets: number;
}

export interface InfraComponent {
  name: string;
  region: "us-east-1" | "us-west-2";
  type: "EKS" | "RDS" | "MSK" | "Elasticsearch" | "Vault" | "S3";
  status: "healthy" | "degraded" | "failing";
  detail: string;
  replicationLagSec?: number;
}

export interface PlatformMetrics {
  eventsPerSecond: number;
  eventsLast24h: number;
  activeIncidents: number;
  subscribingOrgs: number;
  iocsPublished24h: number;
  p99IngestionMs: number;
  errorBudgetRemaining: number; // percent
  vaultSealed: boolean;
  primaryRegion: "healthy" | "degraded" | "failed";
  drRegion: "healthy" | "degraded" | "failed";
  replicationLagSec: number;
}

export interface IntelSubscriber {
  org: string;
  sector: Sector;
  feedFormat: "STIX 2.1" | "TAXII 2.1";
  iocsDelivered24h: number;
  lastPullAt: string;
}
