import { describe, it, expect } from "vitest";
import { resolveAddress, resolveContract } from "../resolve";
import { DEFAULT_SETTINGS_CONFIG } from "../defaults";
import type { SettingsConfig } from "../types";

function makeConfig(overrides?: Partial<SettingsConfig>): SettingsConfig {
  return { ...DEFAULT_SETTINGS_CONFIG, ...overrides };
}

describe("resolveAddress", () => {
  it("returns name for a known address", () => {
    const config = makeConfig({
      addressBook: [
        { address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e", name: "Treasury" },
      ],
    });

    expect(resolveAddress("0x9fC3dc011b461664c835F2527fffb1169b3C213e", config)).toBe("Treasury");
  });

  it("is case-insensitive", () => {
    const config = makeConfig({
      addressBook: [
        { address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e", name: "Treasury" },
      ],
    });

    expect(resolveAddress("0x9fc3dc011b461664c835f2527fffb1169b3c213e", config)).toBe("Treasury");
    expect(resolveAddress("0x9FC3DC011B461664C835F2527FFFB1169B3C213E", config)).toBe("Treasury");
  });

  it("returns null for unknown address", () => {
    const config = makeConfig({ addressBook: [] });
    expect(resolveAddress("0x0000000000000000000000000000000000000001", config)).toBeNull();
  });
});

describe("resolveContract", () => {
  it("returns name for a known contract", () => {
    const config = makeConfig({
      contractRegistry: [
        { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", name: "WETH" },
      ],
    });

    const result = resolveContract("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", config);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("WETH");
  });

  it("is case-insensitive", () => {
    const config = makeConfig({
      contractRegistry: [
        { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", name: "WETH" },
      ],
    });

    const result = resolveContract("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", config);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("WETH");
  });

  it("returns null for unknown contract", () => {
    const config = makeConfig({ contractRegistry: [] });
    expect(resolveContract("0x0000000000000000000000000000000000000001", config)).toBeNull();
  });

  it("includes abi if present", () => {
    const mockAbi = [{ type: "function", name: "transfer" }];
    const config = makeConfig({
      contractRegistry: [
        { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", name: "WETH", abi: mockAbi },
      ],
    });

    const result = resolveContract("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", config);
    expect(result!.abi).toEqual(mockAbi);
  });
});
