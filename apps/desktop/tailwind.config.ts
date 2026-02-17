import type { Config } from "tailwindcss";
import { sharedTailwindThemeConfig } from "@safelens/shared-theme/tailwind";

const config: Config = {
  ...sharedTailwindThemeConfig,
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
};

export default config;
