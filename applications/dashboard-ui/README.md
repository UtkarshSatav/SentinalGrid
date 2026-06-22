# SentinelGrid Dashboard UI

Next.js 15 SOC operator console for the SentinelGrid platform.
Fully offline — uses mock API routes so it runs without any backend.

## Stack

- **Next.js 15** (App Router) + React 19
- **TypeScript**
- **Tailwind CSS** (custom SOC dark palette)
- **lucide-react** icons
- **Recharts** for the event-rate chart

## Run

```bash
cd applications/dashboard-ui
npm install
npm run dev          # http://localhost:3000
```

Build for production:

```bash
npm run build && npm start
```

## Pages

| Route              | What it shows |
|--------------------|---|
| `/`                | Overview — events/sec, incidents, p99 latency, region health, 24-h chart |
| `/events`          | Live threat feed (auto-refresh every 5 s, severity filter, pause/resume) |
| `/incidents`       | Active incidents with playbook step state |
| `/intel`           | Intel-distribution subscribers + IOC counts |
| `/infrastructure`  | Both regions' component health + DR posture |

## API routes (mock)

All under `/api/*`, return JSON, no auth.

- `GET /api/events?limit=80&severity=high&sector=Energy`
- `GET /api/incidents`
- `GET /api/metrics`
- `GET /api/infrastructure`

Data is deterministic-per-window (re-seeded every 5 s) so the dashboard feels live but pages can still be SSR'd consistently.

## Why this exists

A working SOC console makes the SentinelGrid case-study demo tangible. Examiners
can click through pages instead of reading slides; the layout reflects what
operators in a national cyber defense agency would see.

## Replacing the mock backend

Each API route reads from `src/lib/mockData.ts`. To wire to the real backend
(threat-ingestion / threat-analysis / etc.), replace the contents of each
`route.ts` handler — types in `src/lib/types.ts` are the contract.
