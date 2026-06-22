# Dashboard UI: SentinelGrid SOC operator console (Next.js 15 standalone).
# Build context = repository root.
# ────────── deps ──────────
FROM node:22-slim AS deps
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY applications/dashboard-ui/package*.json ./
RUN npm ci

# ────────── builder ──────────
FROM node:22-slim AS builder
WORKDIR /build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /build/node_modules ./node_modules
COPY applications/dashboard-ui/ ./
# Produce a populated SQLite DB (schema + seed) baked into the image.
RUN npm run db:migrate && npm run db:seed
RUN npm run build

# ────────── runtime ──────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DB_PATH=/app/data/sentinelgrid.db
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs nextjs \
 && mkdir -p /app/data
# Next.js standalone server + static assets
COPY --from=builder /build/.next/standalone ./
COPY --from=builder /build/.next/static ./.next/static
COPY --from=builder /build/public ./public
# Seeded database -> writable data dir
COPY --from=builder /build/sentinelgrid.db /app/data/sentinelgrid.db
COPY docker/dashboard-ui/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/metrics').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
