/**
 * Token metadata derived from bundled ERC-7730 descriptors.
 *
 * Key format: `${chainId}:${lowercaseAddress}`
 */

import { bundledDescriptors } from "./descriptors/index";
import type { Deployment, ERC7730Descriptor } from "./types";

export interface TokenMetadata {
  symbol: string;
  decimals: number;
}

function getDeployments(descriptor: ERC7730Descriptor): Deployment[] {
  return [
    ...(descriptor.context.contract?.deployments ?? []),
    ...(descriptor.context.eip712?.deployments ?? []),
  ];
}

function buildTokenMap(descriptors: ERC7730Descriptor[]): Record<string, TokenMetadata> {
  const tokens: Record<string, TokenMetadata> = {};

  for (const descriptor of descriptors) {
    const token = descriptor.metadata.token;
    if (!token || typeof token.decimals !== "number") continue;

    const symbol = token.ticker || token.name;
    if (!symbol) continue;

    for (const deployment of getDeployments(descriptor)) {
      const key = `${deployment.chainId}:${deployment.address.toLowerCase()}`;
      tokens[key] = { symbol, decimals: token.decimals };
    }
  }

  return tokens;
}

const TOKENS = buildTokenMap(bundledDescriptors as unknown as ERC7730Descriptor[]);

/**
 * Look up token metadata by chain ID and address.
 */
export function lookupToken(chainId: number, address: string): TokenMetadata | null {
  const key = `${chainId}:${address.toLowerCase()}`;
  return TOKENS[key] ?? null;
}
