import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
          950: "#2e1065",
        },
        accent: {
          300: "#f9a8d4",
          400: "#f472b6",
          500: "#ec4899",
          600: "#db2777",
        },
        platform: {
          navy: "#1a1040",
          purple: "#2d2060",
          surface: "#f4f5fa",
          muted: "#eef0f6",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        card: "0 2px 16px -2px rgb(26 16 64 / 0.08), 0 4px 24px -4px rgb(26 16 64 / 0.06)",
        "card-hover":
          "0 8px 32px -4px rgb(26 16 64 / 0.14), 0 16px 48px -8px rgb(26 16 64 / 0.08)",
        platform: "0 4px 40px -8px rgb(45 32 96 / 0.18)",
        glow: "0 0 40px -8px rgb(236 72 153 / 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
