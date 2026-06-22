import type { Config } from "drizzle-kit";

export default {
  schema:  "./src/lib/db/schema.ts",
  out:     "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: "./sentinelgrid.db" },
  strict:  true,
  verbose: true,
} satisfies Config;
