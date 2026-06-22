import "server-only";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "..";
import type { IngestKey } from "../schema";

export interface IssuedKey {
  id: string;
  secret: string;   // only available at creation time
  prefix: string;
}

const SECRET_LEN = 32;

export function issueKey(siteId: string, label = "default"): IssuedKey {
  const secret = `sg_${nanoid(SECRET_LEN)}`;
  const prefix = secret.slice(0, 11);
  const keyHash = bcrypt.hashSync(secret, 10);
  const id = nanoid();
  db.insert(schema.ingestKeys).values({ id, siteId, keyHash, prefix, label }).run();
  return { id, secret, prefix };
}

export function listKeys(siteId: string): IngestKey[] {
  return db.select().from(schema.ingestKeys)
    .where(and(eq(schema.ingestKeys.siteId, siteId), isNull(schema.ingestKeys.revokedAt)))
    .all();
}

export function revokeKey(id: string): void {
  db.update(schema.ingestKeys).set({ revokedAt: new Date() }).where(eq(schema.ingestKeys.id, id)).run();
}

export function verifyKey(siteId: string, secret: string): IngestKey | null {
  const keys = db.select().from(schema.ingestKeys)
    .where(and(eq(schema.ingestKeys.siteId, siteId), isNull(schema.ingestKeys.revokedAt)))
    .all();
  for (const k of keys) {
    if (bcrypt.compareSync(secret, k.keyHash)) {
      db.update(schema.ingestKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.ingestKeys.id, k.id)).run();
      return k;
    }
  }
  return null;
}
