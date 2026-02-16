import { describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createNodeSettingsStore } from "./storage";

async function createTempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "safelens-cli-"));
}

describe("Node settings store", () => {
  it("reads, writes, and removes settings on disk", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "settings.json");
    const store = createNodeSettingsStore(filePath);

    try {
      expect(await store.read()).toBeNull();

      await store.write("{\"ok\":true}");
      expect(await store.read()).toBe("{\"ok\":true}");

      await store.remove();
      expect(await store.read()).toBeNull();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
