// Standalone migrate runner — `npm run db:migrate`
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";

const file = process.env.DB_PATH ?? path.resolve(process.cwd(), "sentinelgrid.db");
const sqlite = new Database(file);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const d = drizzle(sqlite);
migrate(d, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
console.log(`✓ migrations applied → ${file}`);
sqlite.close();
