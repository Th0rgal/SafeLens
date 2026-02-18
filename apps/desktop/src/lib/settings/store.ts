import { BaseDirectory, exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { SettingsStore } from "@safelens/core";

const SETTINGS_FILE = "safelens-settings.json";
const SETTINGS_DIR = { baseDir: BaseDirectory.AppData } as const;
const BROWSER_DEV_KEY = "safelens-settings-dev";

function isTauriRuntime(): boolean {
  // Available in Tauri webview; absent in plain browser (e.g. `vite` dev server).
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createTauriSettingsStore(): SettingsStore {
  return {
    async read() {
      if (!isTauriRuntime()) {
        if (typeof localStorage === "undefined") return null;
        return localStorage.getItem(BROWSER_DEV_KEY);
      }
      const fileExists = await exists(SETTINGS_FILE, SETTINGS_DIR);
      if (!fileExists) return null;
      const raw = await readTextFile(SETTINGS_FILE, SETTINGS_DIR);
      return raw.trim().length > 0 ? raw : null;
    },
    async write(payload: string) {
      if (!isTauriRuntime()) {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(BROWSER_DEV_KEY, payload);
        }
        return;
      }
      await writeTextFile(SETTINGS_FILE, payload, SETTINGS_DIR);
    },
    async remove() {
      if (!isTauriRuntime()) {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(BROWSER_DEV_KEY);
        }
        return;
      }
      const fileExists = await exists(SETTINGS_FILE, SETTINGS_DIR);
      if (!fileExists) return;
      await writeTextFile(SETTINGS_FILE, "", SETTINGS_DIR);
    },
  };
}
