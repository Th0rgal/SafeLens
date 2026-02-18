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
      addressRegistry: [
        { address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e", name: "Treasury", kind: "eoa" },
      ],
    });

    expect(resolveAddress("0x9fC3dc011b461664c835F2527fffb1169b3C213e", config)).toBe("Treasury");
  });

  it("is case-insensitive", () => {
    const config = makeConfig({
      addressRegistry: [
        { address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e", name: "Treasury", kind: "eoa" },
      ],
    });

    expect(resolveAddress("0x9fc3dc011b461664c835f2527fffb1169b3c213e", config)).toBe("Treasury");
    expect(resolveAddress("0x9FC3DC011B461664C835F2527FFFB1169B3C213E", config)).toBe("Treasury");
  });

  it("returns null for unknown address", () => {
    const config = makeConfig({ addressRegistry: [] });
    expect(resolveAddress("0x0000000000000000000000000000000000000001", config)).toBeNull();
  });

  it("prefers a matching chain entry when chainId is provided", () => {
    const config = makeConfig({
      addressRegistry: [
        { address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e", name: "Mainnet Treasury", kind: "eoa", chainIds: [1] },
        { address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e", name: "Base Treasury", kind: "eoa", chainIds: [8453] },
      ],
    });

    expect(resolveAddress("0x9fC3dc011b461664c835F2527fffb1169b3C213e", config, 8453)).toBe("Base Treasury");
  });

  it("supports chainIds list matching", () => {
    const config = makeConfig({
      addressRegistry: [
        { address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e", name: "Multichain Treasury", kind: "eoa", chainIds: [1, 8453] },
      ],
    });

    expect(resolveAddress("0x9fC3dc011b461664c835F2527fffb1169b3C213e", config, 8453)).toBe("Multichain Treasury");
  });

  it("falls back to global entry when no chain-specific match exists", () => {
    const config = makeConfig({
      addressRegistry: [
        { address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e", name: "Global Treasury", kind: "eoa" },
        { address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e", name: "Mainnet Treasury", kind: "eoa", chainIds: [1] },
      ],
    });

    expect(resolveAddress("0x9fC3dc011b461664c835F2527fffb1169b3C213e", config, 8453)).toBe("Global Treasury");
  });

  it("returns null when chainId is provided but only other-chain entries exist", () => {
    const config = makeConfig({
      addressRegistry: [
        { address: "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83", name: "USDC on Ethereum", kind: "eoa", chainIds: [1] },
      ],
    });

    expect(resolveAddress("0xddafbb505ad214d7b80b1f830fccc89b60fb7a83", config, 100)).toBeNull();
  });

  it("matches address-only without chainId", () => {
    const config = makeConfig({
      addressRegistry: [
        { address: "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83", name: "USDC on Gnosis", kind: "eoa", chainIds: [100] },
      ],
    });

    // Without chainId, matches first entry regardless of its chainIds
    expect(resolveAddress("0xddafbb505ad214d7b80b1f830fccc89b60fb7a83", config)).toBe("USDC on Gnosis");
  });
});

describe("resolveContract", () => {
  it("returns name for a known contract", () => {
    const config = makeConfig({
      addressRegistry: [
        { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", name: "WETH", kind: "contract" },
      ],
    });

    const result = resolveContract("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", config);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("WETH");
  });

  it("is case-insensitive", () => {
    const config = makeConfig({
      addressRegistry: [
        { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", name: "WETH", kind: "contract" },
      ],
    });

    const result = resolveContract("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", config);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("WETH");
  });

  it("returns null for unknown contract", () => {
    const config = makeConfig({ addressRegistry: [] });
    expect(resolveContract("0x0000000000000000000000000000000000000001", config)).toBeNull();
  });

  it("includes abi if present", () => {
    const mockAbi = [{ type: "function", name: "transfer" }];
    const config = makeConfig({
      addressRegistry: [
        { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", name: "WETH", kind: "contract", abi: mockAbi },
      ],
    });

    const result = resolveContract("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", config);
    expect(result!.abi).toEqual(mockAbi);
  });

  it("supports chainIds list for contracts", () => {
    const config = makeConfig({
      addressRegistry: [
        {
          address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          name: "Wrapped Native",
          kind: "contract",
          chainIds: [1, 10, 42161],
        },
      ],
    });

    const result = resolveContract(
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      config,
      10
    );
    expect(result?.name).toBe("Wrapped Native");
  });
});
