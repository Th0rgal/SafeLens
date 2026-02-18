import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { SettingsStore } from "@safelens/core";

const SETTINGS_FILE = "safelens-settings.json";
const SETTINGS_SUBDIR = "settings";
const SETTINGS_DIR = { baseDir: BaseDirectory.AppData } as const;
const BROWSER_DEV_KEY = "safelens-settings-dev";

function getSettingsFilePath(): string {
  return `${SETTINGS_SUBDIR}/${SETTINGS_FILE}`;
}

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
      const filePath = getSettingsFilePath();
      const fileExists = await exists(filePath, SETTINGS_DIR);
      if (!fileExists) return null;
      const raw = await readTextFile(filePath, SETTINGS_DIR);
      return raw.trim().length > 0 ? raw : null;
    },
    async write(payload: string) {
      if (!isTauriRuntime()) {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(BROWSER_DEV_KEY, payload);
        }
        return;
      }
      try {
        // Ensure app settings folder exists across fresh dev installs.
        await mkdir(SETTINGS_SUBDIR, { ...SETTINGS_DIR, recursive: true });
      } catch {
        // If the directory already exists or is race-created, write below will still succeed.
      }
      await writeTextFile(getSettingsFilePath(), payload, SETTINGS_DIR);
    },
    async remove() {
      if (!isTauriRuntime()) {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(BROWSER_DEV_KEY);
        }
        return;
      }
      const filePath = getSettingsFilePath();
      const fileExists = await exists(filePath, SETTINGS_DIR);
      if (!fileExists) return;
      await writeTextFile(filePath, "", SETTINGS_DIR);
    },
  };
}
