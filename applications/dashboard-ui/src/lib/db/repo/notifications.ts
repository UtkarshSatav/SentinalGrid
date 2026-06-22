import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "..";
import type { Notification } from "../schema";

export function insertNotification(n: {
  orgId: string; incidentId?: string; channel: string;
  title: string; body?: string; severity: string;
}): void {
  db.insert(schema.notifications).values(n).run();
}

export function listNotifications(orgId: string, limit = 25): Notification[] {
  return db.select().from(schema.notifications)
    .where(eq(schema.notifications.orgId, orgId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit)
    .all();
}
