// SentinelGrid — incident-coordination service.
//
// Drives incident-response playbooks (the local stand-in for the Temporal
// workflow engine described in the architecture docs). Exposes a small HTTP
// API to open/advance incidents plus health and Prometheus metrics on :8083.
// Standard library only so it runs on the distroless Node runtime.
"use strict";

const http = require("node:http");
const { randomUUID } = require("node:crypto");

const PORT = Number(process.env.PORT || 8083);

// In-memory incident state. In prod this is backed by Temporal + Postgres.
const incidents = new Map();
let opened = 0;
let resolved = 0;

const PLAYBOOKS = {
  ransomware: ["isolate-host", "revoke-credentials", "snapshot-forensics", "restore-from-backup"],
  insider: ["disable-account", "revoke-tokens", "preserve-audit", "notify-ciso"],
  ddos: ["enable-shield", "scale-edge", "rate-limit", "monitor"],
  default: ["triage", "contain", "eradicate", "recover"],
};

function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  if (url === "/healthz" || url === "/readyz") return send(res, 200, { status: "ok" });

  if (url === "/metrics") {
    res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
    return res.end(
      "# HELP sg_incidents_opened_total Incidents opened\n" +
      "# TYPE sg_incidents_opened_total counter\n" +
      `sg_incidents_opened_total ${opened}\n` +
      "# HELP sg_incidents_resolved_total Incidents resolved\n" +
      "# TYPE sg_incidents_resolved_total counter\n" +
      `sg_incidents_resolved_total ${resolved}\n` +
      "# HELP sg_incidents_active Currently active incidents\n" +
      "# TYPE sg_incidents_active gauge\n" +
      `sg_incidents_active ${incidents.size}\n`
    );
  }

  // POST /v1/incidents  { "type": "ransomware", "source_org": "..." }
  if (method === "POST" && url === "/v1/incidents") {
    const body = await readBody(req);
    const id = randomUUID();
    const steps = PLAYBOOKS[body.type] || PLAYBOOKS.default;
    const incident = { id, type: body.type || "unknown", source_org: body.source_org || null, step: 0, steps, status: "open" };
    incidents.set(id, incident);
    opened++;
    return send(res, 201, incident);
  }

  // POST /v1/incidents/{id}/advance — execute next playbook step
  const adv = url.match(/^\/v1\/incidents\/([^/]+)\/advance$/);
  if (method === "POST" && adv) {
    const inc = incidents.get(adv[1]);
    if (!inc) return send(res, 404, { error: "not found" });
    if (inc.step < inc.steps.length - 1) {
      inc.step++;
    } else {
      inc.status = "resolved";
      resolved++;
      incidents.delete(inc.id);
    }
    return send(res, 200, inc);
  }

  if (url === "/v1/incidents") return send(res, 200, { active: [...incidents.values()] });

  send(res, 404, { error: "not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ level: "info", event: "incident_coordination_started", port: PORT }));
});
