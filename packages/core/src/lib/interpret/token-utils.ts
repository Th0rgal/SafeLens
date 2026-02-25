/**
 * Shared token utilities used by multiple interpreters.
 *
 * Centralizes token resolution and amount formatting to avoid
 * duplication across interpreter files. Token metadata comes from
 * the shared `tokens/well-known` registry.
 */

import type { TokenInfo } from "./types";
import { formatTokenAmount as formatTokenAmountShared } from "../simulation/format";
import { resolveTokenMeta } from "../tokens/well-known";

/** Resolve a token address to metadata (symbol, decimals). */
export function resolveToken(address: string, chainId?: number): TokenInfo {
  const meta = resolveTokenMeta(address, chainId);
  return meta
    ? { address, symbol: meta.symbol, decimals: meta.decimals }
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
