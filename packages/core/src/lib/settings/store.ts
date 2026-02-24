import { settingsConfigSchema, type SettingsConfig } from "./types";
import { DEFAULT_SETTINGS_CONFIG } from "./defaults";

export interface SettingsStore {
  read(): Promise<string | null> | string | null;
  write(payload: string): Promise<void> | void;
  remove(): Promise<void> | void;
}

export type SettingsLoadWarningKind = "parse_error" | "schema_error" | "read_error";

export interface SettingsLoadWarning {
  kind: SettingsLoadWarningKind;
  message: string;
}

export interface SettingsLoadResult {
  config: SettingsConfig;
  warning?: SettingsLoadWarning;
}

export async function loadSettingsConfig(
  store: SettingsStore,
  fallback: SettingsConfig = DEFAULT_SETTINGS_CONFIG
): Promise<SettingsLoadResult> {
  let raw: string | null;
  try {
    raw = await store.read();
  } catch (err) {
    return {
      config: fallback,
      warning: {
        kind: "read_error",
        message: `Failed to read settings: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

  if (!raw) return { config: fallback };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      config: fallback,
      warning: {
        kind: "parse_error",
        message: `Settings file contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

  try {
    const config = settingsConfigSchema.parse(parsed);
    return { config };
  } catch (err) {
    return {
      config: fallback,
      warning: {
        kind: "schema_error",
        message: `Settings file failed schema validation: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
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
  // Warning is intentionally discarded here — load warnings are surfaced
  // through the normal bootstrap path (UI banner / CLI stderr), and the
  // export function only needs the resolved config.
  const { config } = await loadSettingsConfig(store);
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
