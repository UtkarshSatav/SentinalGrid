import "server-only";
import crypto from "node:crypto";
import { openOrBumpIncident } from "@/lib/db/repo/incidents";
import { countEventsSince, eventsByIpRecent } from "@/lib/db/repo/events";
import { insertNotification } from "@/lib/db/repo/notifications";
import type { EnrichedEvent } from "@/lib/enrich";
import type { Site } from "@/lib/db/schema";
import { notifySlack } from "@/lib/notify/slack";

interface RuleResult {
  rule: string;
  title: string;
  severity: string;
  fingerprint: string;
  playbook?: string;
}

function fp(...parts: (string | number | null | undefined)[]) {
  return crypto.createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 16);
}

function pathClass(p: string | null): string {
  if (!p) return "other";
  if (/^\/(login|auth|signin|oauth)/i.test(p)) return "auth";
  if (/^\/api\//i.test(p)) return "api";
  if (/^\/(admin|wp-admin|phpmyadmin)/i.test(p)) return "admin";
  return "other";
}

export async function evaluate(site: Site, event: EnrichedEvent): Promise<RuleResult[]> {
  const out: RuleResult[] = [];

  // R1 — Any high/critical pattern hit
  if (event.threatScore >= 90 || event.severity === "critical") {
    out.push({
      rule: "high_score",
      title: `Critical event observed on ${site.hostname}`,
      severity: "critical",
      fingerprint: fp("high_score", site.id, event.srcIp, pathClass(event.path)),
      playbook: "Investigate + block at edge",
    });
  } else if (event.threatScore >= 70) {
    out.push({
      rule: "high_score",
      title: `High-severity event on ${site.hostname}`,
      severity: "high",
      fingerprint: fp("high_score", site.id, event.srcIp, pathClass(event.path)),
    });
  }

  // R2 — Brute force window: >= 8 events from same IP to auth path with 4xx in 5 min
  if (event.srcIp && pathClass(event.path) === "auth" && (event.statusCode ?? 0) >= 400) {
    const since = new Date(Date.now() - 5 * 60_000);
    const recent = eventsByIpRecent(site.id, event.srcIp, since)
      .filter((e) => pathClass(e.path) === "auth" && (e.statusCode ?? 0) >= 400);
    if (recent.length >= 8) {
      out.push({
        rule: "brute_force",
        title: `Brute-force attempt against ${site.hostname}/login`,
        severity: recent.length >= 30 ? "critical" : "high",
        fingerprint: fp("brute_force", site.id, event.srcIp),
        playbook: "Lock account · block IP · rotate credentials",
      });
    }
  }

  // R3 — Burst rate: > 100 events in last 60s site-wide → DDoS suspect
  const burst = countEventsSince(site.id, new Date(Date.now() - 60_000));
  if (burst > 100) {
    out.push({
      rule: "burst_rate",
      title: `Traffic burst on ${site.hostname} (${burst} events/min)`,
      severity: "high",
      fingerprint: fp("burst_rate", site.id, Math.floor(Date.now() / 60_000)),
      playbook: "Enable rate-limit · scale out · check WAF",
    });
  }

  return out;
}

export async function applyResults(site: Site, results: RuleResult[]): Promise<void> {
  for (const r of results) {
    const { incident, created } = openOrBumpIncident({
      orgId: site.orgId, siteId: site.id,
      fingerprint: r.fingerprint, title: r.title, severity: r.severity,
      ruleId: r.rule, playbook: r.playbook, now: new Date(),
    });
    if (created) {
      insertNotification({
        orgId: site.orgId, incidentId: incident.id, channel: "inapp",
        title: r.title, body: r.playbook, severity: r.severity,
      });
      if (site.slackWebhookUrl) {
        await notifySlack(site.slackWebhookUrl, {
          title: r.title, severity: r.severity, site: site.hostname,
          rule: r.rule, fingerprint: r.fingerprint,
        }).catch((e) => console.error("[slack]", e));
      }
    }
  }
}
