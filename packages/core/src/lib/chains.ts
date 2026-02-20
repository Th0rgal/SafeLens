/**
 * Shared chain configuration: viem chain objects and default public RPC URLs.
 *
 * Both the proof fetcher and the simulation fetcher need these —
 * keeping them in one place prevents drift.
 */

import type { Chain } from "viem";
import {
  mainnet,
  sepolia,
  polygon,
  arbitrum,
  optimism,
  gnosis,
  base,
} from "viem/chains";
import {
  NETWORK_CAPABILITIES_BY_CHAIN_ID,
  getNetworkCapability,
} from "./networks/capabilities";

export const CHAIN_BY_ID: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  100: gnosis,
  8453: base,
};

/** Default public RPC endpoints per chain (rate-limited, best-effort). */
export const DEFAULT_RPC_URLS: Record<number, string> = Object.fromEntries(
  Object.entries(NETWORK_CAPABILITIES_BY_CHAIN_ID)
    .map(([chainId, capability]) => [Number(chainId), capability.defaultRpcUrl])
    .filter((entry): entry is [number, string] => typeof entry[1] === "string")
);

/** Returns explicit capability info for proof/simulation support checks. */
export function getExecutionCapability(chainId: number) {
  return getNetworkCapability(chainId);
}
