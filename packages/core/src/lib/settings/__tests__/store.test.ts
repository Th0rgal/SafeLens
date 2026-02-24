import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadSettingsConfig,
  saveSettingsConfig,
  resetSettingsConfig,
  exportSettingsConfig,
  importSettingsConfig,
  type SettingsStore,
} from "../store";
import { DEFAULT_SETTINGS_CONFIG } from "../defaults";

const storage: { value?: string } = {};
const store: SettingsStore = {
  read: vi.fn(async () => storage.value ?? null),
  write: vi.fn(async (payload: string) => {
    storage.value = payload;
  }),
  remove: vi.fn(async () => {
    delete storage.value;
  }),
};

beforeEach(() => {
  delete storage.value;
  vi.clearAllMocks();
});

describe("loadSettingsConfig", () => {
  it("returns defaults when nothing is stored", async () => {
    const { config, warning } = await loadSettingsConfig(store);
    expect(config).toEqual(DEFAULT_SETTINGS_CONFIG);
    expect(warning).toBeUndefined();
  });

  it("returns stored config when valid", async () => {
    const custom = {
      ...DEFAULT_SETTINGS_CONFIG,
      addressRegistry: [{ address: "0x0000000000000000000000000000000000000001", name: "Test", kind: "eoa" }],
    };
    storage.value = JSON.stringify(custom);

    const { config, warning } = await loadSettingsConfig(store);
    expect(config.addressRegistry).toHaveLength(1);
    expect(config.addressRegistry[0].name).toBe("Test");
    expect(warning).toBeUndefined();
  });

  it("returns defaults with parse_error warning for corrupt data", async () => {
    storage.value = "not json";

    const { config, warning } = await loadSettingsConfig(store);
    expect(config).toEqual(DEFAULT_SETTINGS_CONFIG);
    expect(warning).toBeDefined();
    expect(warning!.kind).toBe("parse_error");
    expect(warning!.message).toContain("invalid JSON");
  });

  it("returns defaults with schema_error warning for invalid schema", async () => {
    storage.value = JSON.stringify({ version: "2.0", invalid: true });

    const { config, warning } = await loadSettingsConfig(store);
    expect(config).toEqual(DEFAULT_SETTINGS_CONFIG);
    expect(warning).toBeDefined();
    expect(warning!.kind).toBe("schema_error");
    expect(warning!.message).toContain("schema validation");
  });

  it("returns defaults with read_error warning when store.read throws", async () => {
    const failStore: SettingsStore = {
      read: vi.fn(async () => { throw new Error("disk failure"); }),
      write: vi.fn(),
      remove: vi.fn(),
    };

    const { config, warning } = await loadSettingsConfig(failStore);
    expect(config).toEqual(DEFAULT_SETTINGS_CONFIG);
    expect(warning).toBeDefined();
    expect(warning!.kind).toBe("read_error");
    expect(warning!.message).toContain("disk failure");
  });
});

describe("saveSettingsConfig", () => {
  it("persists config via store", async () => {
    await saveSettingsConfig(store, DEFAULT_SETTINGS_CONFIG);
    expect(store.write).toHaveBeenCalled();
  });
});

describe("resetSettingsConfig", () => {
  it("removes stored config and returns defaults", async () => {
    storage.value = JSON.stringify(DEFAULT_SETTINGS_CONFIG);

    const config = await resetSettingsConfig(store);
    expect(config).toEqual(DEFAULT_SETTINGS_CONFIG);
    expect(store.remove).toHaveBeenCalled();
  });
});

describe("exportSettingsConfig", () => {
  it("returns valid JSON string", async () => {
    const json = await exportSettingsConfig(store);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe("importSettingsConfig", () => {
  it("imports valid config and saves it", async () => {
    const custom = {
      ...DEFAULT_SETTINGS_CONFIG,
      addressRegistry: [{ address: "0x0000000000000000000000000000000000000001", name: "Imported", kind: "eoa" }],
    };
    const json = JSON.stringify(custom);

    const config = await importSettingsConfig(store, json);
    expect(config.addressRegistry[0].name).toBe("Imported");
    expect(store.write).toHaveBeenCalled();
  });

  it("throws on invalid JSON", async () => {
    await expect(importSettingsConfig(store, "not json")).rejects.toThrow();
  });

  it("throws on invalid schema", async () => {
    await expect(importSettingsConfig(store, JSON.stringify({ version: "2.0" }))).rejects.toThrow();
  });
});
