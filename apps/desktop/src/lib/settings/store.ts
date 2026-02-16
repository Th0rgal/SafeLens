import { BaseDirectory, exists, readTextFile, writeTextFile } from "@tauri-apps/api/fs";
import type { SettingsStore } from "@safelens/core";

const SETTINGS_FILE = "safelens-settings.json";
const SETTINGS_DIR = { dir: BaseDirectory.AppData };

export function createTauriSettingsStore(): SettingsStore {
  return {
    async read() {
      const fileExists = await exists(SETTINGS_FILE, SETTINGS_DIR);
      if (!fileExists) return null;
      const raw = await readTextFile(SETTINGS_FILE, SETTINGS_DIR);
      return raw.trim().length > 0 ? raw : null;
    },
    async write(payload: string) {
      await writeTextFile(SETTINGS_FILE, payload, SETTINGS_DIR);
    },
    async remove() {
      const fileExists = await exists(SETTINGS_FILE, SETTINGS_DIR);
      if (!fileExists) return;
      await writeTextFile(SETTINGS_FILE, "", SETTINGS_DIR);
    },
  };
}
