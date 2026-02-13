import { settingsConfigSchema, type SettingsConfig } from "./types";
import { DEFAULT_SETTINGS_CONFIG } from "./defaults";

export interface SettingsStore {
  read(): Promise<string | null> | string | null;
  write(payload: string): Promise<void> | void;
  remove(): Promise<void> | void;
}

export async function loadSettingsConfig(
  store: SettingsStore,
  fallback: SettingsConfig = DEFAULT_SETTINGS_CONFIG
): Promise<SettingsConfig> {
  try {
    const raw = await store.read();
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return settingsConfigSchema.parse(parsed);
  } catch {
    return fallback;
  }
}

export async function saveSettingsConfig(
  store: SettingsStore,
  config: SettingsConfig
): Promise<void> {
  const validated = settingsConfigSchema.parse(config);
  await store.write(JSON.stringify(validated, null, 2));
}

export async function resetSettingsConfig(
  store: SettingsStore,
  fallback: SettingsConfig = DEFAULT_SETTINGS_CONFIG
): Promise<SettingsConfig> {
  await store.remove();
  return fallback;
}

export async function exportSettingsConfig(store: SettingsStore): Promise<string> {
  const config = await loadSettingsConfig(store);
  return JSON.stringify(config, null, 2);
}

export async function importSettingsConfig(
  store: SettingsStore,
  jsonString: string
): Promise<SettingsConfig> {
  const parsed = JSON.parse(jsonString);
  const config = settingsConfigSchema.parse(parsed);
  await saveSettingsConfig(store, config);
  return config;
}
