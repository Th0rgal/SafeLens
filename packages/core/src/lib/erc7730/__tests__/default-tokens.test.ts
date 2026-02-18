import { describe, expect, it } from "vitest";
import { buildBuiltinTokenMap } from "../default-tokens";
import type { ERC7730Descriptor } from "../types";

describe("buildBuiltinTokenMap", () => {
  it("prefers symbol-based decimals for constants tokens over descriptor token decimals", () => {
    const descriptors: ERC7730Descriptor[] = [
      {
        context: {
          contract: {
            deployments: [{ chainId: 1, address: "0x1111111111111111111111111111111111111111" }],
          },
        },
        metadata: {
          owner: "Example",
          token: {
            name: "Vault Token",
            ticker: "vUSDC",
            decimals: 18,
          },
          constants: {
            underlyingToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            underlyingTicker: "USDC",
          },
        },
        display: {
          formats: {},
        },
      },
    ];

    const map = buildBuiltinTokenMap(descriptors);
    expect(map.get("1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48")).toEqual({
      symbol: "USDC",
      decimals: 6,
    });
  });
});
