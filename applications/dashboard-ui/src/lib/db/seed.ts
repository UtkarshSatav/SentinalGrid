// `npm run db:seed` — creates the demo org and (optionally) a sample site
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "./schema";

const file = process.env.DB_PATH ?? path.resolve(process.cwd(), "sentinelgrid.db");
const sqlite = new Database(file);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });

const DEMO = "demo-org";

const existingOrg = db.select().from(schema.orgs).where(eq(schema.orgs.id, DEMO)).get();
if (!existingOrg) {
  db.insert(schema.orgs).values({ id: DEMO, name: "Demo Org", plan: "free" }).run();
  console.log("✓ demo org created");
} else {
  console.log("• demo org already exists");
}

const existingUser = db.select().from(schema.users).where(eq(schema.users.email, "demo@sentinelgrid.local")).get();
if (!existingUser) {
  db.insert(schema.users).values({
    id: nanoid(), orgId: DEMO,
    email: "demo@sentinelgrid.local", name: "Demo Operator", role: "owner",
  }).run();
  console.log("✓ demo user created");
}

if (process.env.SEED_SAMPLE_SITE === "1") {
  const id = nanoid();
  db.insert(schema.sites).values({
    id, orgId: DEMO, name: "Example.com",
    url: "https://example.com", hostname: "example.com",
    probeIntervalSec: 60, enabled: true,
  }).run();
  console.log(`✓ sample site created (${id})`);
}

console.log("seed complete →", file);
sqlite.close();
