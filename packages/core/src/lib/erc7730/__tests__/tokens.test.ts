import { describe, expect, it } from "vitest";
import { lookupToken } from "../tokens";

describe("lookupToken", () => {
  it("resolves built-in override token metadata for Gnosis USDC", () => {
    const token = lookupToken(100, "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83");
    expect(token).toEqual({ symbol: "USDC", decimals: 6 });
  });
});
