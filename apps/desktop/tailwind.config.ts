import type { Config } from "tailwindcss";
import { sharedTailwindThemeConfig } from "../shared-theme/tailwind";

const config: Config = {
  ...sharedTailwindThemeConfig,
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
};

export default config;
