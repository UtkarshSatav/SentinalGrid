import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "..";
import type { Event, NewEvent } from "../schema";

export function insertEvent(e: NewEvent): Event {
  db.insert(schema.events).values(e).run();
  return db.select().from(schema.events).where(eq(schema.events.id, e.id!)).get()!;
}

export function listEvents(siteId: string, limit = 100): Event[] {
  return db.select().from(schema.events)
    .where(eq(schema.events.siteId, siteId))
    .orderBy(desc(schema.events.ingestedAt))
    .limit(limit)
    .all();
}

export function listAllEvents(limit = 100): Event[] {
  return db.select().from(schema.events)
    .orderBy(desc(schema.events.ingestedAt))
    .limit(limit)
    .all();
}

export function countEventsSince(siteId: string, since: Date): number {
  const row = db.select({ c: sql<number>`count(*)` }).from(schema.events)
    .where(and(eq(schema.events.siteId, siteId), gte(schema.events.ingestedAt, since)))
    .get();
  return row?.c ?? 0;
}

export function eventsByIpRecent(siteId: string, srcIp: string, since: Date): Event[] {
  return db.select().from(schema.events)
    .where(and(
      eq(schema.events.siteId, siteId),
      eq(schema.events.srcIp, srcIp),
      gte(schema.events.ingestedAt, since),
    ))
    .all();
}
