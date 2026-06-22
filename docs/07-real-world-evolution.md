# 07 — Real-World Evolution: SentinelGrid as a Multi-Tenant SOC-as-a-Service

> **The pivot:** instead of being a national-defense platform that partner orgs
> push events to, SentinelGrid becomes a **product** any website can sign up for
> and have its security posture continuously monitored and defended.
>
> **Same architectural muscles** (multi-region, observable, resilient, secret-managed),
> applied to a use case anyone can demo on their own URL.

---

## 1. The vision in one paragraph

A user signs up at `sentinelgrid.io`, pastes a URL (`https://my-startup.com`),
and within **60 seconds** the platform is:
- probing the site from the outside (uptime, TLS, security headers, DNS)
- offering a one-line snippet for the user's nginx/Cloudflare/Vercel/AWS WAF to
  start forwarding access logs to us
- enriching every incoming event with GeoIP + IP-reputation + MITRE mapping
- grouping correlated events into incidents and paging Slack/Discord/email when
  rules match
- showing it all in the same SOC console we already built

The same architectural patterns we designed for the case study (Kafka durability,
Vault dynamic credentials, multi-region failover, Object-Lock audit) survive
intact — just operating at a different scale and serving a different customer.

---

## 2. Two modes of operation (independent, complementary)

### Mode A — **Active probing** (no customer integration needed)

We poll the customer's site from the outside, at configurable intervals. Works
on day-0 with zero changes to their infrastructure.

| Probe | What it catches | Frequency |
|---|---|---|
| HTTP health        | Down, slow, redirect chains, status codes | 30–60 s |
| TLS handshake      | Cert expired, weak ciphers, hostname mismatch | every 5 min |
| Security headers   | Missing CSP, HSTS, X-Frame-Options (Mozilla Observatory grade) | hourly |
| DNS                | NXDOMAIN, hijacks, NS mismatch | every 5 min |
| Subdomain CT scan  | New subdomains via Certificate Transparency (`crt.sh`) | daily |
| Port scan          | Unexpected exposed services (opt-in only) | weekly |
| Tech fingerprint   | Outdated jQuery / WordPress / Apache versions vs CVE feed | daily |

### Mode B — **Passive ingestion** (customer plugs us in)

We expose `POST /v1/ingest/:siteId` with an API key. The customer drops a 5-line
config into one of these to start feeding us logs:

| Integration | Effort | What we see |
|---|---|---|
| Cloudflare Worker | copy-paste 20 lines | Every HTTP request, country, IP, UA |
| Vercel Edge Middleware | one file | Same as above for Vercel sites |
| AWS WAF Logs (Kinesis Firehose) | 1 IAM role, 1 stream | All WAF allow/block events |
| nginx `log_format` + Vector/Filebeat | config snippet | Access + error logs |
| Cloudflare Logpush | dashboard toggle | Enterprise-tier high-fidelity logs |
| GitHub security webhook | one URL paste | Dependabot alerts, secret-scanning hits |
| Sentry → SentinelGrid webhook | one URL paste | App error spikes correlated to attacks |

The same `events` table consumes all of them; the source field tells us which.

---

## 3. High-level architecture

```
        Customer's website (anywhere on the internet)
                  ▲                       │
                  │ active probes         │ passive logs (webhook
                  │ (HTTP/TLS/DNS/        │  from nginx / CF Worker /
                  │  headers/CT)          │  Vercel / WAF / Sentry)
                  │                       │
                  │                       ▼
        ┌─────────┴───────────┐  ┌────────────────────────┐
        │ Prober Workers      │  │ Ingest API             │
        │ (Fly.io / Railway)  │  │ (Next.js Route Handler │
        │ - cron scheduler    │  │  on Vercel Edge)       │
        │ - exponential       │  │ - HMAC-signed API key  │
        │   backoff on fail   │  │ - per-site rate limit  │
        │ - regional pop-up   │  │ - 202 + queue          │
        │   from 3+ locations │  │                        │
        └─────────┬───────────┘  └────────────┬───────────┘
                  │                           │
                  ▼                           ▼
            ┌─────────────────────────────────────┐
            │ Redis (Upstash) — queue + hot cache │
            │ - BullMQ jobs                       │
            │ - IP reputation cache (TTL 6 h)     │
            │ - rate-limit counters               │
            └────────────────┬────────────────────┘
                             │
                             ▼
            ┌────────────────────────────────────┐
            │ Enrichment Worker                  │
            │ - GeoIP (MaxMind GeoLite2)         │
            │ - IP reputation (AbuseIPDB,        │
            │   Spamhaus DROP, OTX, Tor list)    │
            │ - UA parsing (ua-parser-js)        │
            │ - Pattern matching (libinjection   │
            │   for SQLi/XSS, custom regexes)    │
            │ - MITRE ATT&CK technique mapping   │
            │ - Threat score 0–100               │
            └────────────────┬───────────────────┘
                             │
            ┌────────────────▼───────────────────┐
            │ Rule Engine                        │
            │ - per-org alert rules (YAML/SQL)   │
            │ - sliding window aggregations      │
            │ - incident grouping (dedupe by     │
            │   fingerprint = hash(rule, src_ip, │
            │   path_class))                     │
            └────────────────┬───────────────────┘
                             │
            ┌────────────────▼───────────────────┐
            │ Postgres (Neon, branchable)        │
            │ - orgs, users, sites               │
            │ - events partitioned by day        │
            │ - probes partitioned by day        │
            │ - incidents, alert_rules           │
            │ - hot data in pg, > 30 d → S3      │
            │   (Parquet via pg_partman)         │
            └────────────────┬───────────────────┘
                             │
            ┌────────────────▼───────────────────┐
            │ Next.js Dashboard (Vercel)         │
            │ - RSC for dashboards               │
            │ - SSE stream for live events       │
            │ - Server Actions for mutations     │
            │ - Clerk-authed multi-tenant        │
            └────────────────┬───────────────────┘
                             │
                             ▼
            ┌─────────────────────────────────────┐
            │ Notification Fan-out                │
            │ Slack · Discord · Email (Resend) ·  │
            │ PagerDuty · Generic webhook · SMS   │
            │ (Twilio) for critical               │
            └─────────────────────────────────────┘
```

---

## 4. Component breakdown

### 4.1 Prober worker
- Long-running Node process on Fly.io with replicas in 3+ regions (EWR, AMS, SIN)
  so we probe from different vantage points.
- Reads a queue of `(site_id, probe_kind, due_at)` rows from Postgres or Redis.
- Each probe is one bounded function (≤ 5 s budget). Failures backoff
  exponentially (1, 2, 4, 8 min) before counting as "down".
- Writes results to `probes` table; updates `sites.last_status` denormalized.
- If status transitions (healthy → degraded → failed), enqueues an alert.

### 4.2 Ingest API
- A single Next.js route handler running on Vercel Edge.
- Authenticates with HMAC-signed API key (we sign on issue, verify on each call —
  no DB read in the hot path; we cache the key→site_id map in Redis with 60 s TTL).
- Rate-limits per site: 1000 events/sec free tier, configurable per plan.
- Returns `202 Accepted` immediately; pushes the event onto Redis Stream
  `events:incoming`.
- That's it. The handler is dumb on purpose — we want it under 50 ms.

### 4.3 Enrichment worker
- Pulls from `events:incoming` in batches of 100.
- For each event:
  1. **GeoIP** lookup via local MaxMind DB (refreshed weekly via a cron job).
  2. **IP reputation**: Redis cache first; on miss, parallel fetch from
     AbuseIPDB + Spamhaus DROP + AlienVault OTX; store with 6 h TTL.
  3. **Tor exit node** check against a daily-refreshed list.
  4. **UA parsing**: `ua-parser-js` → browser, OS, bot.
  5. **Pattern matching**:
     - `libinjection-node` for SQLi / XSS in URL params and bodies.
     - Path-traversal regex: `\.\./|/etc/passwd|/wp-admin/admin-ajax`.
     - Sensitive-path classification: `/login`, `/admin`, `/api/v*`.
  6. **MITRE mapping** from the pattern → technique (T1190, T1059, etc.).
  7. **Threat score** (0–100):
     `0.4·rep + 0.3·match_severity + 0.2·sensitive_path + 0.1·anomaly_z_score`.
- Writes the enriched row to the `events` table and to a Redis pub/sub channel
  `events:{site_id}` for the live dashboard SSE stream.

### 4.4 Rule engine
- Two evaluation modes:
  - **Streaming**: cheap, in-process. For simple rules: "any event with score ≥ 90".
  - **Window**: every 30 s, run aggregate SQL: "≥ 50 events from same IP to /login
    with status 401 in the last 5 min" → group into an incident.
- Incidents are deduped by a **fingerprint** = `hash(rule_id, src_ip, path_class)`.
  Repeat hits within 1 h increment the existing incident's `event_count` and
  `last_seen` instead of creating a new one.
- On open/escalate, the rule's `channels` list (Slack/Discord/email/PagerDuty)
  gets notified.

### 4.5 Postgres schema (essentials)

```sql
CREATE TABLE organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  plan          text NOT NULL DEFAULT 'free',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id      text UNIQUE NOT NULL,
  email         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_members (
  org_id        uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('owner','admin','analyst','viewer')),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE sites (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              text NOT NULL,
  url               text NOT NULL,
  hostname          text NOT NULL,
  probe_interval_s  int  NOT NULL DEFAULT 60,
  enabled           bool NOT NULL DEFAULT true,
  last_probe_at     timestamptz,
  last_status       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, hostname)
);

CREATE TABLE ingest_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  key_hash      text NOT NULL,                 -- bcrypt of the secret
  prefix        text NOT NULL,                 -- first 8 chars for display
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

CREATE TABLE events (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL,
  source        text NOT NULL,        -- 'access_log' | 'auth_log' | 'waf' | ...
  severity      text NOT NULL,
  src_ip        inet,
  src_country   text,
  src_asn       int,
  src_org       text,
  method        text,
  path          text,
  status_code   int,
  user_agent    text,
  threat_score  smallint,             -- 0-100
  ti_matches    text[],               -- ['abuseipdb','tor','spamhaus']
  mitre_tids    text[],
  raw           jsonb,
  ingested_at   timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (ingested_at);

-- partitions managed by pg_partman, one per day, attached/detached automatically
CREATE INDEX events_site_time ON events (site_id, ingested_at DESC);
CREATE INDEX events_threat    ON events (site_id, threat_score DESC) WHERE threat_score >= 70;

CREATE TABLE incidents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  site_id       uuid NOT NULL,
  fingerprint   text NOT NULL,
  title         text NOT NULL,
  severity      text NOT NULL,
  status        text NOT NULL DEFAULT 'open',
  rule_id       uuid,
  first_seen    timestamptz NOT NULL,
  last_seen     timestamptz NOT NULL,
  event_count   int NOT NULL DEFAULT 1,
  UNIQUE (site_id, fingerprint, status)
);

CREATE TABLE alert_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  name          text NOT NULL,
  enabled       bool NOT NULL DEFAULT true,
  query         jsonb NOT NULL,    -- declarative rule definition
  channels      jsonb NOT NULL,    -- [{ type:'slack', target:'webhook_url' }, ...]
  severity      text NOT NULL DEFAULT 'medium'
);

CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id   uuid NOT NULL REFERENCES incidents(id),
  channel       text NOT NULL,
  delivered_at  timestamptz,
  error         text
);
```

---

## 5. End-to-end flows

### 5.1 Onboarding (≤ 60 seconds)

```
1. User → sign-up at sentinelgrid.io (Clerk)
2. Org auto-created (single-tenant default)
3. "Add your first site" wizard: paste URL
4. Backend: hostname extracted, DNS resolved, /robots.txt fetched (gentle hello)
5. Site row created; prober queue receives 'site_id', schedules first probe within 5 s
6. Dashboard redirects to /sites/<id> — within 30 s the first HTTP probe result appears
7. "Want richer data?" — wizard offers integration snippets:
     - Cloudflare Worker (paste this 20-line Worker script)
     - Vercel Middleware (this file)
     - nginx (this log_format + Vector config)
   User picks one → API key shown once → first events flow in under 60 s
```

### 5.2 An attack hits a customer's login page

```
T=0       Attacker brute-forces /login on customer.example.com
T+50ms    Cloudflare Worker forwards request log to our /v1/ingest
T+60ms    Ingest API: 202 returned, event on Redis stream
T+180ms   Enrichment worker pulls: GeoIP=RU, AbuseIPDB rep=98 (malicious),
          path=/login, status=401, score=94
T+200ms   Event written, pushed to SSE stream → user's open dashboard tab
          shows the event LIVE in the table
T+200ms   Rule engine matches "score≥90 to /login"
T+220ms   Incident "Brute force on customer.example.com" created (or updated)
T+250ms   Slack webhook fired → "🚨 high-severity incident — 1 event so far"
T+5min    Window rule fires: ≥50 events same IP → severity upgraded to critical;
          PagerDuty paged
T+next    User adds the IP to their WAF blocklist via the dashboard's
          one-click action (we call Cloudflare API on their behalf)
```

### 5.3 TLS cert about to expire

```
Every 5 min  Prober does TLS handshake on every site
Some run     Notices cert expires in 21 days
             Updates probes table; rule "tls_expires_in < 30 d" matches
             Email + Slack notification to all org owners + admins
             Dashboard shows a sticky banner on /sites/<id> until renewed
```

---

## 6. Tech stack — chosen for **runnable today**

| Layer | Pick | Why |
|---|---|---|
| Frontend hosting | **Vercel** | Already where Next.js is happiest; preview deploys per PR |
| Auth | **Clerk** (or **Better Auth**) | Multi-tenant orgs out of the box; social + magic-link |
| DB | **Neon Postgres** | Serverless, scales to zero on free tier, **database branching** lets every PR get a fresh DB |
| Cache + queue | **Upstash Redis** | Serverless Redis with BullMQ-compatible Streams; free tier covers demo |
| Workers (prober + enrichment) | **Fly.io** | Long-lived processes, multi-region, $0–5/mo for the demo |
| Object storage (raw logs > 30 d) | **Cloudflare R2** | Zero egress fees; parquet roll-ups via cron |
| Email | **Resend** | Excellent DX, generous free tier |
| Errors | **Sentry** | Free tier fits |
| Uptime of *us* | **Better Stack** | We dogfood: probe our own ingest + dashboard |
| CI/CD | **GitHub Actions** + Vercel previews | Zero infra |
| Secrets | **Doppler** or Vercel env vars | Until we self-host Vault (Phase 4) |

This is the demo stack. The **production design story** for the case study
remains the AWS/EKS/Kafka/Vault one — we present them as "the architectural
patterns are identical; the demo runs the same code on serverless primitives
so any examiner can use it."

---

## 7. Integrations the customer sees (recipes)

### Cloudflare Worker (paste in dashboard → done)

```js
export default {
  async fetch(req, env, ctx) {
    const res = await fetch(req);
    ctx.waitUntil(fetch("https://api.sentinelgrid.io/v1/ingest/" + env.SG_SITE_ID, {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.SG_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        source: "access_log",
        method: req.method,
        path:   new URL(req.url).pathname,
        status_code: res.status,
        user_agent: req.headers.get("user-agent"),
        src_ip:  req.headers.get("cf-connecting-ip"),
        src_country: req.cf?.country,
      }),
    }));
    return res;
  },
};
```

### Vercel middleware

```ts
import { NextResponse, type NextRequest } from "next/server";
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  fetch("https://api.sentinelgrid.io/v1/ingest/" + process.env.SG_SITE_ID, {
    method: "POST",
    headers: { "Authorization": "Bearer " + process.env.SG_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      source: "access_log",
      method: req.method,
      path:   req.nextUrl.pathname,
      user_agent: req.headers.get("user-agent"),
      src_ip:  req.ip,
      src_country: req.geo?.country,
    }),
    keepalive: true,
  }).catch(() => {});
  return res;
}
```

### nginx + Vector

```nginx
log_format json escape=json '{"src_ip":"$remote_addr","method":"$request_method","path":"$uri","status_code":$status,"user_agent":"$http_user_agent","ts":"$time_iso8601"}';
access_log /var/log/nginx/access.json json;
```

```toml
# /etc/vector/vector.toml
[sources.nginx]
type = "file"
include = ["/var/log/nginx/access.json"]
[sinks.sentinelgrid]
type = "http"
inputs = ["nginx"]
uri = "https://api.sentinelgrid.io/v1/ingest/$SG_SITE_ID"
encoding.codec = "json"
auth.strategy = "bearer"
auth.token = "$SG_KEY"
```

---

## 8. Multi-tenancy & security (non-negotiables)

- **Row-level security** in Postgres: every query carries `org_id` via a
  Postgres session variable (`SET LOCAL app.current_org_id = ...`), enforced
  by RLS policies on every tenant-owned table. No accidental cross-tenant
  reads possible.
- **API keys are bcrypt-hashed** at rest; only the prefix (first 8 chars) is
  ever displayed. We show the full key once on creation.
- **Per-org rate limits** on the ingest endpoint, enforced in Redis with a
  sliding window. Free tier: 1k events/sec. Burst absorbed by the queue.
- **No customer credentials stored** for inbound integrations — we mint our
  own keys; the customer's secrets live with them.
- **Outbound webhooks signed** with HMAC-SHA256 + replay nonce, so the
  customer's Slack channel can't be spoofed.
- **PII scrub at ingestion** — `authorization` headers, `cookie`, anything
  matching common credit-card / SSN regexes is dropped before write.
- **Audit log** of every dashboard action → append-only S3 (we keep the
  WORM/Object-Lock pattern from the case study).

---

## 9. Real-world use cases this actually solves

| Customer | Problem we solve |
|---|---|
| Indie SaaS founder | "Is my site up? Is anyone attacking my login? Is my cert about to expire?" — for free, in 60 seconds. |
| Agency managing 50 client sites | One dashboard across all clients; per-client billing; analyst log-in. |
| Mid-market SaaS | Centralized SOC across 12 microservices without buying Splunk. |
| Internal corporate IT | Monitor 30 internal apps; integrate with Active Directory; alerts to Teams. |
| Bug-bounty triager | Watch your target's TLS / DNS / subdomain surface and get pinged on changes. |

---

## 10. Phased delivery plan

| Phase | Scope | Wall-clock |
|---|---|---|
| **0 — Foundations** | Clerk auth, Neon DB, orgs, sites table, basic CRUD UI | 1–2 days |
| **1 — Active probing** | HTTP/TLS/headers probes via Fly.io worker; dashboard shows results | 2 days |
| **2 — Passive ingestion** | Ingest API + Redis stream + enrichment worker (GeoIP + UA) | 2–3 days |
| **3 — Threat intel** | AbuseIPDB / Spamhaus / Tor integration; threat score | 1–2 days |
| **4 — Rule engine + alerts** | Streaming + window rules, incident grouping, Slack/Discord/email | 2–3 days |
| **5 — Integrations** | Cloudflare Worker recipe, Vercel middleware, nginx/Vector docs | 1 day |
| **6 — Polish** | Landing page, billing (Stripe), public status page, onboarding flow | 2–3 days |

Total: **~14 days of focused work** to a launchable beta.

---

## 11. How this relates to the case study

The case study answer **doesn't change** — the AWS multi-region, EKS, Kafka,
Vault, ELK, Jenkins, Terraform design still answers the case-study prompt
correctly. This document describes a **parallel runnable product** that:

1. Uses the **same architectural patterns** (multi-tenant, audited, observable,
   secret-managed, multi-region-ready, queue-backed durability).
2. Demonstrates the patterns work in practice — anyone can sign up at the URL
   and see real events flowing.
3. Lets you tell the viva examiner: *"Here is the production design (AWS).
   Here is the same code running on serverless infrastructure so you can
   actually use it right now."*

The mapping is direct:

| Case-study component | Real-world equivalent |
|---|---|
| Terraform on AWS | Vercel + Fly.io configs + a `pulumi/` folder we maintain in parallel |
| EKS multi-region | Vercel global edge + Fly.io multi-region workers |
| Kafka MSK | Redis Streams (smaller scale, same semantics) |
| RDS PostgreSQL | Neon Postgres |
| Elasticsearch | Postgres JSONB + Parquet roll-up to R2 |
| Vault | Doppler (demo) → self-hosted Vault (later) |
| Jenkins | GitHub Actions + Vercel preview deploys |
| ELK | Sentry + Better Stack + the dashboard itself |
| Prometheus + Grafana | Vercel Analytics + a Grafana Cloud free tier for backends |
| Velero K8s backups | Neon point-in-time recovery + R2 versioning |
| Route 53 failover | Vercel global edge handles this implicitly |

---

## 12. What makes this "next level"

1. **Real data, real value** — not mocks. The dashboard shows actual attacks
   on the customer's actual site.
2. **Multi-tenant from day 1** — sign-up flow, orgs, API keys, role-based
   access. No demo data; every event belongs to a real customer.
3. **Real threat intelligence** — AbuseIPDB / Spamhaus / Tor / GeoIP.
4. **Real integrations** — Cloudflare, Vercel, nginx, AWS WAF, Sentry, GitHub.
5. **A public URL** anyone can hit. The viva examiner can sign up, point at
   their own personal blog, and watch their own access logs stream in.
6. **The architectural story is still defensible** — same patterns, scaled to
   what the demo's traffic justifies.

---

## Next concrete steps

1. Spin up Clerk + Neon + Vercel project (~30 min).
2. Build the `/sites` CRUD + first HTTP probe (Phase 1, ~1 day).
3. Stand up the ingest endpoint + one enrichment worker (Phase 2, ~1 day).
4. Wire the existing SOC console UI to real Neon data instead of `mockData.ts`
   — the types in `src/lib/types.ts` already match. Schemas converge.

When you're ready, I can start with Phase 0 + 1 in this repo.
