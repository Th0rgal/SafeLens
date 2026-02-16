import { describe, it, expect } from "vitest";
import { computeConfigFingerprint, colorFromHash } from "../fingerprint";
import type { SettingsConfig } from "../types";

const baseConfig: SettingsConfig = {
  version: "1.0",
  chains: {
    "1": { name: "Ethereum" },
  },
  addressBook: [
    { address: "0x1111111111111111111111111111111111111111", name: "Alice" },
  ],
  contractRegistry: [],
};

describe("computeConfigFingerprint", () => {
  it("returns a 64-char hex string", async () => {
    const hash = await computeConfigFingerprint(baseConfig);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same config always produces same hash", async () => {
    const a = await computeConfigFingerprint(baseConfig);
    const b = await computeConfigFingerprint(baseConfig);
    expect(a).toBe(b);
  });

  it("is key-order independent — different key order produces same hash", async () => {
    const config1: SettingsConfig = {
      version: "1.0",
      chains: { "1": { name: "Eth" } },
      addressBook: [],
      contractRegistry: [],
    };
    // Same data, different key order
    const config2 = {
      contractRegistry: [],
      addressBook: [],
      version: "1.0" as const,
      chains: { "1": { name: "Eth" } },
    };
    const a = await computeConfigFingerprint(config1);
    const b = await computeConfigFingerprint(config2);
    expect(a).toBe(b);
  });

  it("changes when an address book name changes", async () => {
    const modified: SettingsConfig = {
      ...baseConfig,
      addressBook: [
        { address: "0x1111111111111111111111111111111111111111", name: "Bob" },
      ],
    };
    const a = await computeConfigFingerprint(baseConfig);
    const b = await computeConfigFingerprint(modified);
    expect(a).not.toBe(b);
  });

  it("changes when an address book address changes", async () => {
    const modified: SettingsConfig = {
      ...baseConfig,
      addressBook: [
        { address: "0x2222222222222222222222222222222222222222", name: "Alice" },
      ],
    };
    const a = await computeConfigFingerprint(baseConfig);
    const b = await computeConfigFingerprint(modified);
    expect(a).not.toBe(b);
  });

  it("changes when a chain name changes", async () => {
    const modified: SettingsConfig = {
      ...baseConfig,
      chains: {
        "1": { name: "Mainnet" },
      },
    };
    const a = await computeConfigFingerprint(baseConfig);
    const b = await computeConfigFingerprint(modified);
    expect(a).not.toBe(b);
  });

  it("changes when a contract registry entry is added", async () => {
    const modified: SettingsConfig = {
      ...baseConfig,
      contractRegistry: [
        { address: "0x3333333333333333333333333333333333333333", name: "WETH" },
      ],
    };
    const a = await computeConfigFingerprint(baseConfig);
    const b = await computeConfigFingerprint(modified);
    expect(a).not.toBe(b);
  });

  it("changes when a chain is added", async () => {
    const modified: SettingsConfig = {
      ...baseConfig,
      chains: {
        ...baseConfig.chains,
        "100": { name: "Gnosis" },
      },
    };
    const a = await computeConfigFingerprint(baseConfig);
    const b = await computeConfigFingerprint(modified);
    expect(a).not.toBe(b);
  });
});

describe("colorFromHash", () => {
  it("returns a valid HSL color string", () => {
    const color = colorFromHash("ab" + "0".repeat(62));
    expect(color).toMatch(/^hsl\(\d+, 65%, 55%\)$/);
  });

  it("produces different colors for different hashes", () => {
    const a = colorFromHash("00" + "0".repeat(62));
    const b = colorFromHash("ff" + "0".repeat(62));
    expect(a).not.toBe(b);
  });

  it("hue 0x00 → 0°, hue 0xff → 360°", () => {
    expect(colorFromHash("00" + "0".repeat(62))).toBe("hsl(0, 65%, 55%)");
    expect(colorFromHash("ff" + "0".repeat(62))).toBe("hsl(360, 65%, 55%)");
  });
});
