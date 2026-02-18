/**
 * Token metadata derived from bundled ERC-7730 descriptors.
 *
 * Key format: `${chainId}:${lowercaseAddress}`
 */

import { bundledDescriptors } from "./descriptors/index";
import type { ERC7730Descriptor } from "./types";
import { buildBuiltinTokenMap } from "./default-tokens";

export interface TokenMetadata {
  symbol: string;
  decimals: number;
}

const TOKENS = buildBuiltinTokenMap(bundledDescriptors as unknown as ERC7730Descriptor[]);

/**
 * Look up token metadata by chain ID and address.
 */
export function lookupToken(chainId: number, address: string): TokenMetadata | null {
  const key = `${chainId}:${address.toLowerCase()}`;
  return TOKENS.get(key) ?? null;
}
