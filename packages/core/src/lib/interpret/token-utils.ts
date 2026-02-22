/**
 * Shared token utilities used by multiple interpreters.
 *
 * Centralizes well-known token metadata, token resolution, and
 * amount formatting to avoid duplication across interpreter files.
 */

import type { TokenInfo } from "./types";

// ── Well-known tokens (Ethereum Mainnet) ─────────────────────────────

export const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {
    symbol: "WETH",
    decimals: 18,
  },
  "0x6b175474e89094c44da98b954eedeac495271d0f": {
    symbol: "DAI",
    decimals: 18,
  },
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": {
    symbol: "USDC",
    decimals: 6,
  },
  "0xdac17f958d2ee523a2206206994597c13d831ec7": {
    symbol: "USDT",
    decimals: 6,
  },
};

/** Resolve a token address to metadata (symbol, decimals). */
export function resolveToken(address: string): TokenInfo {
  const known = KNOWN_TOKENS[address.toLowerCase()];
  return known
    ? { address, symbol: known.symbol, decimals: known.decimals }
    : { address };
}

/**
 * Format a raw token amount with decimals.
 *
 * Uses pure BigInt arithmetic to avoid float64 precision loss
 * (safe for any decimal count, including > 18).
 */
export function formatTokenAmount(raw: string, decimals: number): string {
  const value = BigInt(raw);
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  const fractional = remainder.toString().padStart(decimals, "0").slice(0, 4);
  return `${whole}.${fractional}`;
}
