import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  serverExternalPackages: ["better-sqlite3", "drizzle-orm", "geoip-lite", "bcryptjs"],
  webpack: (cfg, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(cfg.externals) ? cfg.externals : [cfg.externals].filter(Boolean);
      cfg.externals = [
        ...externals,
        { "better-sqlite3": "commonjs better-sqlite3" },
        { "bindings":       "commonjs bindings" },
      ];
    }
    return cfg;
  },
};

export default config;
