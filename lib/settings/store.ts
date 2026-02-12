import { settingsConfigSchema, type SettingsConfig } from "./types";
import { DEFAULT_SETTINGS_CONFIG } from "./defaults";

const STORAGE_KEY = "safelens-settings-config";

export function loadSettingsConfig(): SettingsConfig {
  if (typeof globalThis.localStorage === "undefined") return DEFAULT_SETTINGS_CONFIG;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS_CONFIG;
    const parsed = JSON.parse(raw);
    return settingsConfigSchema.parse(parsed);
  } catch {
    return DEFAULT_SETTINGS_CONFIG;
  }
}

export function saveSettingsConfig(config: SettingsConfig): void {
  if (typeof globalThis.localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetSettingsConfig(): SettingsConfig {
  if (typeof globalThis.localStorage === "undefined") return DEFAULT_SETTINGS_CONFIG;
  localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_SETTINGS_CONFIG;
}

export function exportSettingsConfig(): string {
  const config = loadSettingsConfig();
  return JSON.stringify(config, null, 2);
}

export function importSettingsConfig(jsonString: string): SettingsConfig {
  const parsed = JSON.parse(jsonString);
  const config = settingsConfigSchema.parse(parsed);
  saveSettingsConfig(config);
  return config;
}
