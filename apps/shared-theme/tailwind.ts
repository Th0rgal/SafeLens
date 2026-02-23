import type { Config } from "tailwindcss";

export const sharedTailwindThemeConfig: Omit<Config, "content"> = {
  darkMode: ["class", ".dark"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Noto Sans", "Helvetica", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        bg: "rgb(var(--background) / <alpha-value>)",
        surface: "rgb(var(--background-elevated) / <alpha-value>)",
        "surface-2": "rgb(var(--background-tertiary) / <alpha-value>)",
        fg: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--foreground-secondary) / <alpha-value>)",
        subtle: "rgb(var(--foreground-tertiary) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-hover": "rgb(var(--accent-hover) / <alpha-value>)",
      },
      animation: {
        "fade-in-up": "fade-in-up 0.3s ease-out",
      },
      keyframes: {
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      boxShadow: {},
    },
  },
  plugins: [],
};
