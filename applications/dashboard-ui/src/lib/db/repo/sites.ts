import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "..";
import type { Site, NewSite } from "../schema";

export function listSites(orgId: string): Site[] {
  return db.select().from(schema.sites)
    .where(eq(schema.sites.orgId, orgId))
    .orderBy(desc(schema.sites.createdAt))
    .all();
}

export function getSite(orgId: string, id: string): Site | undefined {
  return db.select().from(schema.sites)
    .where(and(eq(schema.sites.orgId, orgId), eq(schema.sites.id, id)))
    .get();
}

export function getSiteByIdAny(id: string): Site | undefined {
  return db.select().from(schema.sites).where(eq(schema.sites.id, id)).get();
}

export function createSite(input: Omit<NewSite, "createdAt">): Site {
  db.insert(schema.sites).values(input).run();
  return db.select().from(schema.sites).where(eq(schema.sites.id, input.id!)).get()!;
}

export function updateSite(id: string, patch: Partial<NewSite>): void {
  db.update(schema.sites).set(patch).where(eq(schema.sites.id, id)).run();
}

export function deleteSite(id: string): void {
  db.delete(schema.sites).where(eq(schema.sites.id, id)).run();
}

export function recordProbeStatus(id: string, status: string, observedAt: Date): void {
  db.update(schema.sites)
    .set({ lastStatus: status, lastProbeAt: observedAt })
    .where(eq(schema.sites.id, id))
    .run();
}
