import { appDataDir, join } from "@tauri-apps/api/path";
import { createDir, exists, readTextFile, writeTextFile, removeFile } from "@tauri-apps/api/fs";
import type { SettingsStore } from "@safelens/core";

const SETTINGS_FILE = "safelens-settings.json";

async function getSettingsPath(): Promise<string> {
  const dir = await appDataDir();
  await createDir(dir, { recursive: true });
  return await join(dir, SETTINGS_FILE);
}

export function createTauriSettingsStore(): SettingsStore {
  return {
    async read() {
      const path = await getSettingsPath();
      const fileExists = await exists(path);
      if (!fileExists) return null;
      return await readTextFile(path);
    },
    async write(payload: string) {
      const path = await getSettingsPath();
      await writeTextFile(path, payload);
    },
    async remove() {
      const path = await getSettingsPath();
      const fileExists = await exists(path);
      if (!fileExists) return;
      await removeFile(path);
    },
  };
}
