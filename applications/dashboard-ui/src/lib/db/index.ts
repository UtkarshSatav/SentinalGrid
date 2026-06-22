import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

function createDb(): DB {
  const file = process.env.DB_PATH ?? path.resolve(process.cwd(), "sentinelgrid.db");
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  return drizzle(sqlite, { schema });
}

declare global {
  // eslint-disable-next-line no-var
  var __sgDb: DB | undefined;
  // eslint-disable-next-line no-var
  var __sgSchedulerStarted: boolean | undefined;
}

export const db: DB = globalThis.__sgDb ?? (globalThis.__sgDb = createDb());

// Lazy-start the probe scheduler on first DB access. Avoids the
// instrumentation-file webpack issues with `node:` URIs in built-ins.
if (!globalThis.__sgSchedulerStarted) {
  globalThis.__sgSchedulerStarted = true;
  import("@/lib/scheduler")
    .then((m) => m.getScheduler().start())
    .catch((e) => console.error("[scheduler] failed to start", e));
}

export { schema };
