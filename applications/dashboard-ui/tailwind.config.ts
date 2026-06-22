import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // SOC dark palette
        bg: {
          DEFAULT: "#0b1220",
          elev:    "#0f172a",
          panel:   "#111c33",
        },
        border: {
          DEFAULT: "#1e293b",
          strong:  "#334155",
        },
        accent: {
          DEFAULT: "#6366f1",
          green:   "#10b981",
          amber:   "#f59e0b",
          red:     "#ef4444",
          cyan:    "#06b6d4",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "ping-slow":  "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
