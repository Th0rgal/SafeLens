import { SafeUrlData, SafeUrlParseResult } from "../types";
import {
  NETWORK_CAPABILITIES_BY_CHAIN_ID,
  getNetworkCapability,
  getNetworkCapabilityByPrefix,
  SAFE_ADDRESS_SEARCH_CHAIN_IDS,
} from "../networks/capabilities";

/**
 * Parse a Safe transaction URL
 * Example: https://app.safe.global/transactions/tx?safe=eth:0x9fC3dc011b461664c835F2527fffb1169b3C213e&id=multisig_0x9fC3dc011b461664c835F2527fffb1169b3C213e_0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17
 */
export function parseSafeUrl(urlString: string): SafeUrlData {
  try {
    const url = new URL(urlString);

    // Get safe parameter (e.g., "eth:0x...")
    const safeParam = url.searchParams.get("safe");
    if (!safeParam) {
      throw new Error("Missing 'safe' parameter in URL");
    }

    const [chainPrefix, safeAddress] = safeParam.split(":");
    if (!chainPrefix || !safeAddress) {
      throw new Error("Invalid 'safe' parameter format. Expected format: 'chain:address'");
    }

    const network = getNetworkCapabilityByPrefix(chainPrefix);
    if (!network) {
      throw new Error(`Unsupported chain prefix: ${chainPrefix}`);
    }
    const chainId = network.chainId;

    if (!/^0x[a-fA-F0-9]{40}$/.test(safeAddress)) {
      throw new Error("Invalid Safe address format");
    }

    // Get id parameter (e.g., "multisig_0x..._0x...")
    const idParam = url.searchParams.get("id");
    if (!idParam) {
      throw new Error("Missing 'id' parameter in URL");
    }

    // Extract safeTxHash from id parameter
    // Format: multisig_{safeAddress}_{safeTxHash}
    const parts = idParam.split("_");
    if (parts.length !== 3 || parts[0] !== "multisig") {
      throw new Error("Invalid 'id' parameter format. Expected format: 'multisig_{address}_{hash}'");
    }

    const safeTxHash = parts[2];
    if (!/^0x[a-fA-F0-9]{64}$/.test(safeTxHash)) {
      throw new Error("Invalid Safe transaction hash format");
    }

    return {
      chainId,
      safeAddress,
      safeTxHash,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse Safe URL: ${error.message}`);
    }
    throw new Error("Failed to parse Safe URL");
  }
}

/**
 * Parse a Safe URL flexibly: returns either a full transaction reference
 * or just the queue (chain + address) when no `id` param is present.
 */
export function parseSafeUrlFlexible(urlString: string): SafeUrlParseResult {
  try {
    const url = new URL(urlString);

    const safeParam = url.searchParams.get("safe");
    if (!safeParam) {
      throw new Error("Missing 'safe' parameter in URL");
    }

    const [chainPrefix, safeAddress] = safeParam.split(":");
    if (!chainPrefix || !safeAddress) {
      throw new Error("Invalid 'safe' parameter format. Expected format: 'chain:address'");
    }

    const network = getNetworkCapabilityByPrefix(chainPrefix);
    if (!network) {
      throw new Error(`Unsupported chain prefix: ${chainPrefix}`);
    }
    const chainId = network.chainId;

    if (!/^0x[a-fA-F0-9]{40}$/.test(safeAddress)) {
      throw new Error("Invalid Safe address format");
    }

    const idParam = url.searchParams.get("id");
    if (!idParam) {
      return { type: "queue", data: { chainId, safeAddress } };
    }

    const parts = idParam.split("_");
    if (parts.length !== 3 || parts[0] !== "multisig") {
      throw new Error("Invalid 'id' parameter format. Expected format: 'multisig_{address}_{hash}'");
    }

    const safeTxHash = parts[2];
    if (!/^0x[a-fA-F0-9]{64}$/.test(safeTxHash)) {
      throw new Error("Invalid Safe transaction hash format");
    }

    return { type: "transaction", data: { chainId, safeAddress, safeTxHash } };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse Safe URL: ${error.message}`);
    }
    throw new Error("Failed to parse Safe URL");
  }
}

/**
 * Get the chain prefix string for a given chain ID (reverse of CHAIN_PREFIX_MAP)
 */
export function getChainPrefix(chainId: number): string {
  const network = getNetworkCapability(chainId);
  if (!network) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return network.chainPrefix;
}

/** Chain IDs with Safe Transaction Service support (excludes deprecated testnets) */
export const SUPPORTED_CHAIN_IDS = SAFE_ADDRESS_SEARCH_CHAIN_IDS;

/**
 * Get Safe Transaction Service API URL for a chain
 */
export function getSafeApiUrl(chainId: number): string {
  const network = getNetworkCapability(chainId);
  if (!network) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return network.safeApiUrl;
}

/**
 * Get chain name from chain ID
 */
export function getChainName(chainId: number): string {
  return NETWORK_CAPABILITIES_BY_CHAIN_ID[chainId]?.chainName ?? `Chain ${chainId}`;
}
