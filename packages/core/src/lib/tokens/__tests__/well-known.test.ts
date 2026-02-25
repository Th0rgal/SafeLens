import { describe, expect, it } from "vitest";
import { resolveTokenMeta } from "../well-known";

describe("resolveTokenMeta", () => {
  it("returns null for unknown token", () => {
    expect(resolveTokenMeta("0x0000000000000000000000000000000000000001")).toBeNull();
  });

  it("resolves mainnet WETH by chain ID", () => {
    const meta = resolveTokenMeta("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 1);
    expect(meta).toEqual({ symbol: "WETH", decimals: 18 });
  });

  it("resolves mainnet USDC by chain ID", () => {
    const meta = resolveTokenMeta("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 1);
    expect(meta).toEqual({ symbol: "USDC", decimals: 6 });
  });

  it("resolves Polygon WPOL by chain ID", () => {
    const meta = resolveTokenMeta("0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", 137);
    expect(meta).toEqual({ symbol: "WPOL", decimals: 18 });
  });

  it("resolves Arbitrum WETH by chain ID", () => {
    const meta = resolveTokenMeta("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", 42161);
    expect(meta).toEqual({ symbol: "WETH", decimals: 18 });
  });

  it("resolves Optimism DAI by chain ID", () => {
    const meta = resolveTokenMeta("0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", 10);
    expect(meta).toEqual({ symbol: "DAI", decimals: 18 });
  });

  it("resolves Base USDC by chain ID", () => {
    const meta = resolveTokenMeta("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 8453);
    expect(meta).toEqual({ symbol: "USDC", decimals: 6 });
  });

  it("resolves Gnosis COW by chain ID", () => {
    const meta = resolveTokenMeta("0x177127622c4A00F3d409B75571e12cB3c8973d3c", 100);
    expect(meta).toEqual({ symbol: "COW", decimals: 18 });
  });

  it("falls back to address-only lookup when chainId is undefined", () => {
    const meta = resolveTokenMeta("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
    expect(meta).toEqual({ symbol: "WETH", decimals: 18 });
  });

  it("falls back to address-only lookup for unknown chain", () => {
    const meta = resolveTokenMeta("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 999999);
    expect(meta).toEqual({ symbol: "USDC", decimals: 6 });
  });

  it("returns null for Polygon-only token without chain ID", () => {
    // WPOL only exists with chain prefix, no fallback entry
    expect(resolveTokenMeta("0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270")).toBeNull();
  });

  it("is case-insensitive", () => {
    const upper = resolveTokenMeta("0xC02AAA39B223FE8D0A0E5C4F27EAD9083C756CC2", 1);
    const lower = resolveTokenMeta("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", 1);
    expect(upper).toEqual(lower);
    expect(upper).not.toBeNull();
  });
});
