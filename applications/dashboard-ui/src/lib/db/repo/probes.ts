import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "..";
import type { Probe, NewProbe } from "../schema";

export function insertProbe(p: NewProbe): void {
  db.insert(schema.probes).values(p).run();
}

export function listProbes(siteId: string, limit = 100): Probe[] {
  return db.select().from(schema.probes)
    .where(eq(schema.probes.siteId, siteId))
    .orderBy(desc(schema.probes.observedAt))
    .limit(limit)
    .all();
}

export function latestProbesByKind(siteId: string): Record<string, Probe> {
  const all = db.select().from(schema.probes)
    .where(eq(schema.probes.siteId, siteId))
    .orderBy(desc(schema.probes.observedAt))
    .limit(50)
    .all();
  const byKind: Record<string, Probe> = {};
  for (const p of all) if (!byKind[p.kind]) byKind[p.kind] = p;
  return byKind;
}

export function probesSince(siteId: string, since: Date, kind?: string): Probe[] {
  const where = kind
    ? and(eq(schema.probes.siteId, siteId), gte(schema.probes.observedAt, since), eq(schema.probes.kind, kind))
    : and(eq(schema.probes.siteId, siteId), gte(schema.probes.observedAt, since));
  return db.select().from(schema.probes).where(where).orderBy(desc(schema.probes.observedAt)).all();
}
