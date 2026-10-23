/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        apple: {
          bg: "var(--apple-bg, #080e1a)",
          "bg-sec": "var(--apple-bg-secondary, #0c0d0e)",
          surface: "var(--apple-surface, #141518)",
          "surface-sec": "var(--apple-surface-secondary, #1c1e22)",
          "surface-ter": "var(--apple-surface-tertiary, #272a30)",
          border: "var(--apple-border, rgba(255, 255, 255, 0.10))",
          "border-strong": "var(--apple-border-strong, rgba(255, 255, 255, 0.20))",
          text: "var(--apple-text, #f5f5f7)",
          "text-sec": "var(--apple-text-secondary, #a1a1a6)",
          "text-ter": "var(--apple-text-tertiary, #6e6e73)",
          accent: "var(--apple-accent, #2997ff)",
          "accent-hover": "var(--apple-accent-hover, #47a6ff)",
          gold: "var(--apple-gold, #f59e0b)",
          safe: "var(--apple-safe, #4ade80)",
          warn: "var(--apple-warn, #fbbf24)",
          danger: "var(--apple-danger, #f87171)",
        },
        navy: {
          800: "#1e293b",
          850: "#131e33",
          900: "#0f172a",
          925: "#0b1329",
          950: "#080e1a",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"Inter"',
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
      },
      borderRadius: {
        appleSm: "6px",
        appleMd: "10px",
        appleLg: "16px",
        appleFull: "980px",
      },
      boxShadow: {
        glow: "0 0 25px -4px rgba(41, 151, 255, 0.28)",
        "glow-danger": "0 0 20px -3px rgba(248, 113, 113, 0.35)",
        "glow-safe": "0 0 20px -3px rgba(74, 222, 128, 0.3)",
        appleCard: "0 4px 24px -1px rgba(0, 0, 0, 0.25)",
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
  plugins: [],
};
