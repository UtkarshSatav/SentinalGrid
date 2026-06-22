import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

// ── helpers ─────────────────────────────────────────────────────────────────
const id  = () => text("id").primaryKey().$defaultFn(() => nanoid());
const now = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());
const bool = (col: string) => integer(col, { mode: "boolean" });

// ── orgs / users (multi-tenant schema, single-tenant demo) ──────────────────
export const orgs = sqliteTable("orgs", {
  id: id(),
  name:      text("name").notNull(),
  plan:      text("plan").notNull().default("free"),
  createdAt: now(),
});

export const users = sqliteTable("users", {
  id: id(),
  orgId:     text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  email:     text("email").notNull().unique(),
  name:      text("name"),
  role:      text("role").notNull().default("admin"),  // owner | admin | analyst | viewer
  createdAt: now(),
});

// ── sites ───────────────────────────────────────────────────────────────────
export const sites = sqliteTable("sites", {
  id: id(),
  orgId:            text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name:             text("name").notNull(),
  url:              text("url").notNull(),
  hostname:         text("hostname").notNull(),
  probeIntervalSec: integer("probe_interval_sec").notNull().default(60),
  enabled:          bool("enabled").notNull().default(true),
  slackWebhookUrl:  text("slack_webhook_url"),
  lastProbeAt:      integer("last_probe_at", { mode: "timestamp_ms" }),
  lastStatus:       text("last_status"),                                  // healthy|degraded|failed|unknown
  createdAt:        now(),
}, (t) => ({
  orgIdx: index("sites_org_idx").on(t.orgId),
}));

// ── ingest API keys ─────────────────────────────────────────────────────────
export const ingestKeys = sqliteTable("ingest_keys", {
  id: id(),
  siteId:     text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  keyHash:    text("key_hash").notNull(),
  prefix:     text("prefix").notNull(),
  label:      text("label").notNull().default("default"),
  createdAt:  now(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  revokedAt:  integer("revoked_at",   { mode: "timestamp_ms" }),
}, (t) => ({
  siteIdx: index("keys_site_idx").on(t.siteId),
}));

// ── probe results (active monitoring) ───────────────────────────────────────
export const probes = sqliteTable("probes", {
  id: id(),
  siteId:     text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  kind:       text("kind").notNull(),     // http | tls | headers | dns
  status:     text("status").notNull(),   // healthy | degraded | failed
  latencyMs:  integer("latency_ms"),
  statusCode: integer("status_code"),
  details:    text("details", { mode: "json" }).$type<Record<string, unknown>>(),
  observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => ({
  siteTimeIdx: index("probes_site_time_idx").on(t.siteId, t.observedAt),
}));

// ── ingested events (passive) ──────────────────────────────────────────────
export const events = sqliteTable("events", {
  id: id(),
  siteId:       text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  source:       text("source").notNull(),
  severity:     text("severity").notNull(),
  srcIp:        text("src_ip"),
  srcCountry:   text("src_country"),
  srcAsn:       integer("src_asn"),
  srcOrg:       text("src_org"),
  method:       text("method"),
  path:         text("path"),
  statusCode:   integer("status_code"),
  userAgent:    text("user_agent"),
  uaBrowser:    text("ua_browser"),
  uaOs:         text("ua_os"),
  uaBot:        bool("ua_bot"),
  threatScore:  integer("threat_score"),    // 0-100
  tiMatches:    text("ti_matches", { mode: "json" }).$type<string[]>(),
  mitreTids:    text("mitre_tids",  { mode: "json" }).$type<string[]>(),
  raw:          text("raw",          { mode: "json" }).$type<Record<string, unknown>>(),
  ingestedAt:   integer("ingested_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => ({
  siteTimeIdx: index("events_site_time_idx").on(t.siteId, t.ingestedAt),
  threatIdx:   index("events_threat_idx").on(t.siteId, t.threatScore),
}));

// ── incidents ───────────────────────────────────────────────────────────────
export const incidents = sqliteTable("incidents", {
  id: id(),
  orgId:       text("org_id").notNull().references(() => orgs.id,  { onDelete: "cascade" }),
  siteId:      text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  fingerprint: text("fingerprint").notNull(),
  title:       text("title").notNull(),
  severity:    text("severity").notNull(),
  status:      text("status").notNull().default("open"),         // open | investigating | contained | resolved
  ruleId:      text("rule_id"),
  firstSeen:   integer("first_seen", { mode: "timestamp_ms" }).notNull(),
  lastSeen:    integer("last_seen",  { mode: "timestamp_ms" }).notNull(),
  eventCount:  integer("event_count").notNull().default(1),
  assignee:    text("assignee"),
  playbook:    text("playbook"),
  createdAt:   now(),
}, (t) => ({
  siteIdx:    index("inc_site_idx").on(t.siteId, t.status),
  fingerIdx:  index("inc_fingerprint_idx").on(t.siteId, t.fingerprint, t.status),
}));

// ── in-app notifications ────────────────────────────────────────────────────
export const notifications = sqliteTable("notifications", {
  id: id(),
  orgId:       text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  incidentId:  text("incident_id").references(() => incidents.id, { onDelete: "cascade" }),
  channel:     text("channel").notNull(),    // inapp | slack | email
  title:       text("title").notNull(),
  body:        text("body"),
  severity:    text("severity").notNull(),
  read:        bool("read").notNull().default(false),
  createdAt:   now(),
}, (t) => ({
  orgIdx: index("notif_org_idx").on(t.orgId, t.createdAt),
}));

// ── types ───────────────────────────────────────────────────────────────────
export type Org           = typeof orgs.$inferSelect;
export type Site          = typeof sites.$inferSelect;
export type NewSite       = typeof sites.$inferInsert;
export type IngestKey     = typeof ingestKeys.$inferSelect;
export type Probe         = typeof probes.$inferSelect;
export type NewProbe      = typeof probes.$inferInsert;
export type Event         = typeof events.$inferSelect;
export type NewEvent      = typeof events.$inferInsert;
export type Incident      = typeof incidents.$inferSelect;
export type Notification  = typeof notifications.$inferSelect;
