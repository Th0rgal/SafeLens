import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { SettingsStore } from "@safelens/core";

const DEFAULT_DIR = path.join(os.homedir(), ".safelens");
const DEFAULT_FILE = path.join(DEFAULT_DIR, "settings.json");

export function resolveSettingsPath(customPath?: string): string {
  if (customPath) return customPath;
  return DEFAULT_FILE;
}

export function createNodeSettingsStore(filePath?: string): SettingsStore {
  const resolved = resolveSettingsPath(filePath);

  return {
    async read() {
      try {
        return await fs.readFile(resolved, "utf-8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async write(payload: string) {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, payload, "utf-8");
    },
    async remove() {
      try {
        await fs.unlink(resolved);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
        throw err;
      }
    },
  };
}
