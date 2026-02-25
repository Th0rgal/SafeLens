import { describe, expect, it } from "vitest";
import { formatTokenAmount, resolveToken } from "../token-utils";

describe("resolveToken", () => {
  it("resolves mainnet WETH without chainId (fallback)", () => {
    const token = resolveToken("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
    expect(token.symbol).toBe("WETH");
    expect(token.decimals).toBe(18);
  });

  it("resolves Polygon USDC with chainId", () => {
    const token = resolveToken("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", 137);
    expect(token.symbol).toBe("USDC");
    expect(token.decimals).toBe(6);
  });

  it("returns address-only for unknown token", () => {
    const addr = "0x0000000000000000000000000000000000000042";
    const token = resolveToken(addr);
    expect(token.address).toBe(addr);
    expect(token.symbol).toBeUndefined();
    expect(token.decimals).toBeUndefined();
  });

  it("resolves Arbitrum WETH with chainId", () => {
    const token = resolveToken("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", 42161);
    expect(token.symbol).toBe("WETH");
    expect(token.decimals).toBe(18);
  });
});

describe("formatTokenAmount", () => {
  it("formats standard 18-decimal values (strips trailing zeros)", () => {
    expect(formatTokenAmount("1500000000000000000", 18)).toBe("1.5");
  });

  it("uses exact BigInt exponent math for high decimals", () => {
    const raw = (BigInt(10) ** BigInt(24)).toString();
    expect(formatTokenAmount(raw, 24)).toBe("1");
  });

  it("adds thousands separators for large values", () => {
    // 5000 WETH
    const raw = (5000n * 10n ** 18n).toString();
    expect(formatTokenAmount(raw, 18)).toContain("5,000");
  });

  it("shows <0.0001 for dust amounts", () => {
    // 1 wei of WETH
    expect(formatTokenAmount("1", 18)).toBe("<0.0001");
  });

  it("formats zero as 0", () => {
    expect(formatTokenAmount("0", 18)).toBe("0");
  });

  it("formats 6-decimal tokens correctly", () => {
    // 1.5 USDC
    expect(formatTokenAmount("1500000", 6)).toBe("1.5");
  });
});
