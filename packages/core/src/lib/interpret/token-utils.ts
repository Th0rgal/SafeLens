/**
 * Shared token utilities used by multiple interpreters.
 *
 * Centralizes well-known token metadata, token resolution, and
 * amount formatting to avoid duplication across interpreter files.
 */

import type { TokenInfo } from "./types";
import { formatTokenAmount as formatTokenAmountShared } from "../simulation/format";

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
 * Delegates to the shared `formatTokenAmount` in `simulation/format.ts`
 * which provides thousands separators, trailing-zero stripping,
 * and "<0.0001" for dust amounts.
 */
export function formatTokenAmount(raw: string, decimals: number): string {
  return formatTokenAmountShared(BigInt(raw), decimals, null);
}
