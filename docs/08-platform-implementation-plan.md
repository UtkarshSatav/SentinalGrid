# 08 — Platform Implementation Plan (End-to-End, Executable)

> The plan to convert the SentinelGrid SOC console from a mocked demo into a
> **fully working security-monitoring platform** that probes real websites and
> ingests real logs — all runnable locally with one command.

---

## 0. The "done" state

When this is finished, running `npm run dev` will let anyone:

1. Open `localhost:3001` to a real dashboard backed by a real database.
2. Paste any URL (`https://example.com`) into the **Add Site** wizard.
3. Within **30 seconds** see the first probe results: HTTP uptime, TLS cert
   expiry, security-headers grade, DNS records.
4. Get a copy-pasteable **curl one-liner** + **Cloudflare Worker** snippet that
   sends events to our ingest API.
5. Run the curl command — the event appears in the **live feed within 1 second**,
   enriched with country, browser, threat score, MITRE technique ID.
6. Click **Simulate brute-force attack** — 60 synthetic events fire; the rule
   engine groups them into one critical incident; if a Slack webhook is
   configured, a real Slack alert hits the channel.

No cloud accounts needed. No paid services. One install, one start command.

---

## 1. Tech decisions (defendable in viva)

| Layer | Choice | Why this fits |
|---|---|---|
| **DB** | SQLite via `better-sqlite3` + Drizzle ORM | Zero setup; Drizzle schema is identical to Postgres → swapping to Neon is a one-line driver change |
| **Queue** | In-process async | Single-process demo; production design uses BullMQ on Redis Streams (same producer/consumer code shape) |
| **Auth** | Hard-coded "demo" org for now | Schema is fully multi-tenant; auth is the only missing piece — wire Clerk in Phase 6 without touching anything else |
| **GeoIP** | `geoip-lite` (embedded MaxMind DB) | No API key; ~30 MB on disk; same shape of result as MaxMind GeoLite2 web API |
| **IP reputation** | Deterministic mock + `ABUSEIPDB_KEY` env-flag for real | Demo always shows realistic data; toggle to real with one env var |
| **Pattern detection** | Curated regex set (SQLi, XSS, path traversal, scanner UAs) | No native compilation; libinjection swap-ready as a Phase 6 upgrade |
| **Notifications** | Slack webhook + in-app bell | Real Slack messages when URL is pasted; in-app fallback always works |
| **Scheduler** | `node-cron` singleton (HMR-aware) | Same process as Next.js for the demo; production splits to a Fly.io worker |
| **Live updates** | 2-second polling | Simpler than SSE; SSE is a Phase 6 upgrade once a real load needs it |

---

## 2. New dependencies

```jsonc
{
  "drizzle-orm":        "^0.36.x",   // ORM
  "better-sqlite3":     "^11.x",     // SQLite driver
  "geoip-lite":         "^1.4.x",    // embedded GeoIP
  "ua-parser-js":       "^2.x",      // UA parsing
  "zod":                "^3.x",      // request validation
  "bcryptjs":           "^2.4.x",    // API-key hashing
  "node-cron":          "^3.x",      // scheduler
  "nanoid":             "^5.x"       // ID generation
}
```

Plus dev deps for migrations (`drizzle-kit`) and types.

---

## 3. File-by-file plan

### New (~28 files)

```
src/lib/db/
  schema.ts                    Drizzle schema for all tables
  index.ts                     Singleton DB client; auto-migrates on first import
  seed.ts                      Demo data: one org, one demo site, 200 sample events
  repo/
    sites.ts                   CRUD for sites
    events.ts                  Insert, list, query events
    incidents.ts               Open/close/dedupe incidents
    probes.ts                  Insert probe results
    keys.ts                    Issue/verify ingest keys (bcrypt)

src/lib/probe/
  http.ts                      HTTP uptime + latency probe
  tls.ts                       TLS handshake + cert inspection
  headers.ts                   Security-headers analysis + grade
  dns.ts                       DNS resolution for A/AAAA/MX/NS
  index.ts                     Runs all probes for one site, writes results

src/lib/enrich/
  geoip.ts                     IP → country/city/ASN via geoip-lite
  reputation.ts                IP rep score (mock + AbuseIPDB hook)
  ua.ts                        User-agent → browser/os/bot
  patterns.ts                  Regex-based attack detection (SQLi/XSS/traversal)
  mitre.ts                     Pattern → MITRE ATT&CK technique mapping
  score.ts                     Combined threat score (0-100)
  index.ts                     Pipeline: raw event → enriched event

src/lib/rules/
  defaults.ts                  Built-in rules (high-score, brute-force, TLS expiry)
  engine.ts                    Evaluate rule against enriched event; group by fingerprint
  index.ts                     Run rules after enrichment

src/lib/notify/
  slack.ts                     POST to Slack webhook
  inapp.ts                     Write a row to in-app notifications table
  index.ts                     Fan-out an alert to all channels for an incident

src/lib/scheduler.ts           node-cron singleton; calls probe.runAll() on schedule

src/lib/demo/
  attack-simulator.ts          Generate 60 brute-force events through ingest API

src/app/api/v1/ingest/[siteId]/route.ts    Real ingest endpoint
src/app/api/sites/route.ts                  Sites CRUD
src/app/api/sites/[id]/route.ts             Single-site read/update/delete
src/app/api/sites/[id]/keys/route.ts        Issue + revoke ingest keys
src/app/api/sites/[id]/simulate/route.ts    Trigger the attack simulator
src/app/api/cron/tick/route.ts              Manual probe trigger
src/app/api/stream/events/route.ts          (optional Phase 5) SSE live stream

src/app/sites/page.tsx                     Sites list
src/app/sites/[id]/page.tsx                Site detail (uptime, TLS, headers, events)
src/app/sites/[id]/integrations/page.tsx   Copy-paste integration recipes
src/app/onboarding/page.tsx                First-run wizard

drizzle.config.ts              Drizzle Kit config
```

### Modified

```
src/lib/types.ts               Re-export Drizzle inferred types instead of hand-rolled
src/lib/mockData.ts            Becomes a thin shim that reads from real DB
                               (so existing pages keep working unchanged)
src/app/api/events/route.ts    Read from DB instead of mockData
src/app/api/incidents/route.ts Read from DB
src/app/api/metrics/route.ts   Aggregate live metrics from DB
src/app/api/infrastructure/route.ts  Read site/probe data
src/app/page.tsx               Auto-redirect to /onboarding if no sites exist
src/components/Sidebar.tsx     Add "Sites" nav item
package.json                   New deps + scripts: db:migrate, db:seed, db:studio
README.md                      New "Real platform mode" section
```

---

## 4. Phased delivery (1 phase ≈ one chat turn or one focused session)

Each phase ends in a **green-light state**: it builds, it runs, you can demo the
acceptance criterion before moving on.

### Phase 1 — Database foundation
**Goal:** Drizzle schema lives; `npm run db:migrate` creates the DB; `npm run db:seed` populates it.
**Acceptance:**
- `sqlite3 sentinelgrid.db .tables` lists all 8 tables
- `npm run db:seed` finishes silently
- A simple query script can list the seeded site

**Files created:** `db/schema.ts`, `db/index.ts`, `db/seed.ts`, `drizzle.config.ts`, all repo helpers.

### Phase 2 — Active probing
**Goal:** Pointing a site at `https://example.com` produces real probe results.
**Acceptance:**
- HTTP probe records 200 + latency
- TLS probe records cert expiry + issuer
- Headers probe assigns an A–F grade
- DNS probe records the A record
- `/api/cron/tick` triggers all probes for all enabled sites
- Manual button on `/sites/[id]` triggers a probe and shows fresh results

**Files created:** all of `lib/probe/*`, `lib/scheduler.ts`, `/api/cron/tick`.

### Phase 3 — Real ingest + enrichment
**Goal:** A curl with the right key inserts an enriched event.
**Acceptance:**
- `POST /api/v1/ingest/{siteId}` with Bearer key returns `202` in < 100 ms
- Wrong key → 401; rate limit > 100/s → 429
- Event row has GeoIP country, UA-parsed browser, threat_score 0–100, MITRE technique
- `/events` page shows it within 2 seconds

**Files created:** all of `lib/enrich/*`, `/api/v1/ingest/[siteId]/route.ts`, `lib/db/repo/keys.ts`.

### Phase 4 — Rule engine + incidents
**Goal:** Patterns become incidents. Brute-force gets caught.
**Acceptance:**
- A single event with `threat_score >= 90` opens an incident
- 50 events from one IP to `/login` with 4xx in 5 minutes opens one **critical** incident (not 50)
- Repeat events update `event_count` and `last_seen` on the existing incident
- Closing/resolving an incident updates the row

**Files created:** all of `lib/rules/*`, modifications to ingest route to call rule engine.

### Phase 5 — Notifications + onboarding + integration recipes
**Goal:** First-run feels real; Slack actually pings.
**Acceptance:**
- First-time visit → `/onboarding` wizard
- After "Add Site", `/sites/[id]/integrations` shows working curl + CF Worker snippets prefilled with the new key
- Pasting a Slack webhook URL → run the attack simulator → real Slack notification arrives
- Bell icon shows in-app notification with link to the incident

**Files created:** all of `lib/notify/*`, `onboarding`, `integrations` pages, attack simulator.

### Phase 6 — Polish + production readiness (optional, post-viva)
- Swap SQLite → Neon Postgres (driver change in `db/index.ts`)
- Wire Clerk auth and remove hardcoded org
- Move scheduler + enrichment to Fly.io workers, switch to Redis queue
- Add SSE live stream
- libinjection for stronger pattern detection
- Stripe billing

Each Phase 6 item is independently swappable thanks to the abstractions in
Phases 1–5.

---

## 5. The viva demo script (5 minutes flat)

```
00:00  Open laptop. Run: cd applications/dashboard-ui && npm run dev
00:10  Browser opens to onboarding wizard. "Add your first site"
00:15  Paste https://example.com — wizard creates site, redirects to /sites/[id]
00:30  HTTP probe result appears: 200 OK, 84 ms
00:45  TLS panel populates: cert valid, expires in 217 days, DigiCert
01:00  Security headers grade: B+ (missing CSP)
01:15  Click "Integrations" tab → curl one-liner is shown, pre-filled with API key
01:30  Switch to terminal. Paste the curl. 202 returned.
01:35  Browser tab: event appears in feed table, country flag = IN, score = 12
02:00  Click "Simulate brute force attack"
02:10  60 events stream in over 3 seconds; threat_score climbs each one
02:30  Incident card appears: "Brute force on example.com" — CRITICAL, 60 events
02:45  Bell icon shows the notification; (if Slack URL configured) Slack pings
03:00  Open /infrastructure → show DR posture, region health (still mock OK)
03:30  Open /docs/07-real-world-evolution.md → walk through architecture
04:30  Q&A
```

---

## 6. Out of scope (be honest with the examiner)

| Not built | Why it's OK |
|---|---|
| Production Postgres + multi-region | Demo runs on SQLite to be one-command; swap is well-isolated |
| Real Clerk auth | Schema is multi-tenant; missing only the session layer |
| Argo Rollouts / canaries | This is the application layer, not the deploy layer |
| Velero backups | Demo is local; backups would re-attach in Phase 6 |
| WAF / DDoS shield | Customer's edge stack does this; we observe, not protect |
| SOC 2 / FedRAMP compliance | Architectural patterns support it; certifications are a process not a feature |

---

## 7. Risks and how we'll handle them

| Risk | Mitigation |
|---|---|
| HMR breaks the scheduler singleton | Standard `globalThis` guard pattern from the Drizzle docs |
| External HTTP probes get blocked / timed out | 5-second timeout, graceful failure path, written as "degraded" |
| SQLite write contention under simulator burst | Write batching in the ingest path; ≤ 5 writes/sec is well within SQLite limits |
| Slack webhook fails / network offline | In-app notification still records; webhook error logged |
| User points at `localhost` (loopback) | Reject in validation with helpful error |

---

## 8. Final acceptance checklist

When all of these pass, the platform is **done for the viva**:

- [ ] `npm install && npm run dev` succeeds with no manual setup
- [ ] First visit shows onboarding wizard
- [ ] Adding `https://example.com` produces real probe results within 30 s
- [ ] `/sites/[id]/integrations` page shows working curl one-liner
- [ ] Running the curl inserts an enriched event visible in `/events`
- [ ] "Simulate attack" button creates one critical incident from 60 events
- [ ] Slack webhook (if set) receives a real message
- [ ] All 5 original dashboard pages still work, now backed by real DB
- [ ] Production build (`npm run build`) succeeds
- [ ] `npm run typecheck` clean

---

## 9. Ready to start?

Phase 1 (DB foundation) is ~2 hours of focused work. Phases 2–5 are each
~1 hour. Total to viva-ready: **~6 hours of focused build**, split across as
many chat turns as you want.

Decisions I made on your behalf (override any before we start):
1. SQLite, not Postgres
2. Single hardcoded org, no auth UI
3. Mock IP reputation by default
4. node-cron in-process, not separate worker

Say the word and I start with Phase 1.
