import type { Config } from "tailwindcss";
import { sharedTailwindThemeConfig } from "@safelens/shared-theme/tailwind";

const config: Config = {
  ...sharedTailwindThemeConfig,
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
  ],
};

export default config;
