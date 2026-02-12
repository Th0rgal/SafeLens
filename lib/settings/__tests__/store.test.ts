import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadSettingsConfig,
  saveSettingsConfig,
  resetSettingsConfig,
  exportSettingsConfig,
  importSettingsConfig,
} from "../store";
import { DEFAULT_SETTINGS_CONFIG } from "../defaults";

// Mock localStorage
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete storage[key];
  }),
};

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

beforeEach(() => {
  Object.keys(storage).forEach((key) => delete storage[key]);
  vi.clearAllMocks();
});

describe("loadSettingsConfig", () => {
  it("returns defaults when nothing is stored", () => {
    const config = loadSettingsConfig();
    expect(config).toEqual(DEFAULT_SETTINGS_CONFIG);
  });

  it("returns stored config when valid", () => {
    const custom: typeof DEFAULT_SETTINGS_CONFIG = { ...DEFAULT_SETTINGS_CONFIG, addressBook: [{ address: "0x0000000000000000000000000000000000000001", name: "Test" }] };
    storage["safelens-settings-config"] = JSON.stringify(custom);

    const config = loadSettingsConfig();
    expect(config.addressBook).toHaveLength(1);
    expect(config.addressBook[0].name).toBe("Test");
  });

  it("returns defaults for corrupt data", () => {
    storage["safelens-settings-config"] = "not json";

    const config = loadSettingsConfig();
    expect(config).toEqual(DEFAULT_SETTINGS_CONFIG);
  });

  it("returns defaults for invalid schema", () => {
    storage["safelens-settings-config"] = JSON.stringify({ version: "2.0", invalid: true });

    const config = loadSettingsConfig();
    expect(config).toEqual(DEFAULT_SETTINGS_CONFIG);
  });
});

describe("saveSettingsConfig", () => {
  it("persists config to localStorage", () => {
    saveSettingsConfig(DEFAULT_SETTINGS_CONFIG);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "safelens-settings-config",
      JSON.stringify(DEFAULT_SETTINGS_CONFIG)
    );
  });
});

describe("resetSettingsConfig", () => {
  it("removes stored config and returns defaults", () => {
    storage["safelens-settings-config"] = JSON.stringify(DEFAULT_SETTINGS_CONFIG);

    const config = resetSettingsConfig();
    expect(config).toEqual(DEFAULT_SETTINGS_CONFIG);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("safelens-settings-config");
  });
});

describe("exportSettingsConfig", () => {
  it("returns valid JSON string", () => {
    const json = exportSettingsConfig();
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe("importSettingsConfig", () => {
  it("imports valid config and saves it", () => {
    const custom: typeof DEFAULT_SETTINGS_CONFIG = { ...DEFAULT_SETTINGS_CONFIG, addressBook: [{ address: "0x0000000000000000000000000000000000000001", name: "Imported" }] };
    const json = JSON.stringify(custom);

    const config = importSettingsConfig(json);
    expect(config.addressBook[0].name).toBe("Imported");
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it("throws on invalid JSON", () => {
    expect(() => importSettingsConfig("not json")).toThrow();
  });

  it("throws on invalid schema", () => {
    expect(() => importSettingsConfig(JSON.stringify({ version: "2.0" }))).toThrow();
  });
});
