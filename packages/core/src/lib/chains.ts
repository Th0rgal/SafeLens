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
export const DEFAULT_RPC_URLS: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  137: "https://polygon-bor-rpc.publicnode.com",
  42161: "https://arbitrum-one-rpc.publicnode.com",
  10: "https://optimism-rpc.publicnode.com",
  100: "https://gnosis-rpc.publicnode.com",
  8453: "https://base-rpc.publicnode.com",
};
