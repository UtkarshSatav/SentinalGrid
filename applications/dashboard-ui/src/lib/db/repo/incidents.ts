import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "..";
import type { Incident } from "../schema";

interface UpsertInput {
  orgId: string;
  siteId: string;
  fingerprint: string;
  title: string;
  severity: string;
  ruleId?: string;
  playbook?: string;
  now: Date;
}

/** Open a new incident for this fingerprint, or bump event_count/last_seen on the existing open one. */
export function openOrBumpIncident(i: UpsertInput): { incident: Incident; created: boolean } {
  const existing = db.select().from(schema.incidents)
    .where(and(
      eq(schema.incidents.siteId, i.siteId),
      eq(schema.incidents.fingerprint, i.fingerprint),
      ne(schema.incidents.status, "resolved"),
    ))
    .get();

  if (existing) {
    db.update(schema.incidents)
      .set({ lastSeen: i.now, eventCount: existing.eventCount + 1 })
      .where(eq(schema.incidents.id, existing.id))
      .run();
    const refreshed = db.select().from(schema.incidents).where(eq(schema.incidents.id, existing.id)).get()!;
    return { incident: refreshed, created: false };
  }

  const id = crypto.randomUUID().slice(0, 12);
  db.insert(schema.incidents).values({
    id, orgId: i.orgId, siteId: i.siteId, fingerprint: i.fingerprint,
    title: i.title, severity: i.severity, status: "open",
    ruleId: i.ruleId, playbook: i.playbook,
    firstSeen: i.now, lastSeen: i.now, eventCount: 1,
  }).run();
  const created = db.select().from(schema.incidents).where(eq(schema.incidents.id, id)).get()!;
  return { incident: created, created: true };
}

export function listIncidents(orgId: string, limit = 50): Incident[] {
  return db.select().from(schema.incidents)
    .where(eq(schema.incidents.orgId, orgId))
    .orderBy(desc(schema.incidents.lastSeen))
    .limit(limit)
    .all();
}

export function listOpenIncidents(orgId: string): Incident[] {
  return db.select().from(schema.incidents)
    .where(and(eq(schema.incidents.orgId, orgId), ne(schema.incidents.status, "resolved")))
    .orderBy(desc(schema.incidents.lastSeen))
    .all();
}

export function countOpenIncidents(orgId: string): number {
  const row = db.select({ c: sql<number>`count(*)` }).from(schema.incidents)
    .where(and(eq(schema.incidents.orgId, orgId), ne(schema.incidents.status, "resolved")))
    .get();
  return row?.c ?? 0;
}
