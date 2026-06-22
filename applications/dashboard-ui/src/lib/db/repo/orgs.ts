import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "..";

const DEMO_ORG_ID = "demo-org";

export function ensureDemoOrg() {
  const existing = db.select().from(schema.orgs).where(eq(schema.orgs.id, DEMO_ORG_ID)).get();
  if (existing) return existing;
  db.insert(schema.orgs).values({ id: DEMO_ORG_ID, name: "Demo Org", plan: "free" }).run();
  return db.select().from(schema.orgs).where(eq(schema.orgs.id, DEMO_ORG_ID)).get()!;
}

export function getDemoOrgId() {
  ensureDemoOrg();
  return DEMO_ORG_ID;
}
