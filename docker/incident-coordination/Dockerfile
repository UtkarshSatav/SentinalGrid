# Incident-coordination: workflow engine driving Temporal playbooks (Node.js).
FROM node:22-alpine AS builder
WORKDIR /build
COPY applications/incident-coordination/package*.json ./
# No runtime deps today; ensure node_modules exists so the runtime COPY succeeds.
RUN npm ci --omit=dev && mkdir -p node_modules
COPY applications/incident-coordination/ ./
RUN npm run build

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
USER nonroot
EXPOSE 8083
ENV NODE_ENV=production
ENTRYPOINT ["/nodejs/bin/node", "dist/server.js"]
