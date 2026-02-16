import { SafeUrlData, SafeUrlParseResult } from "../types";

const CHAIN_PREFIX_MAP: Record<string, number> = {
  eth: 1, // Ethereum Mainnet
  gor: 5, // Goerli
  sep: 11155111, // Sepolia
  matic: 137, // Polygon
  arb1: 42161, // Arbitrum One
  oeth: 10, // Optimism
  gno: 100, // Gnosis Chain
  base: 8453, // Base
};

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

    const chainId = CHAIN_PREFIX_MAP[chainPrefix];
    if (!chainId) {
      throw new Error(`Unsupported chain prefix: ${chainPrefix}`);
    }

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
 * Parse a Safe URL flexibly — returns either a full transaction reference
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

    const chainId = CHAIN_PREFIX_MAP[chainPrefix];
    if (!chainId) {
      throw new Error(`Unsupported chain prefix: ${chainPrefix}`);
    }

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
  const entry = Object.entries(CHAIN_PREFIX_MAP).find(([, id]) => id === chainId);
  if (!entry) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return entry[0];
}

/** Chain IDs with Safe Transaction Service support (excludes deprecated testnets) */
export const SUPPORTED_CHAIN_IDS = [1, 11155111, 137, 42161, 10, 100, 8453] as const;

/**
 * Get Safe Transaction Service API URL for a chain
 */
export function getSafeApiUrl(chainId: number): string {
  const apiUrls: Record<number, string> = {
    1: "https://safe-transaction-mainnet.safe.global",
    5: "https://safe-transaction-goerli.safe.global",
    11155111: "https://safe-transaction-sepolia.safe.global",
    137: "https://safe-transaction-polygon.safe.global",
    42161: "https://safe-transaction-arbitrum.safe.global",
    10: "https://safe-transaction-optimism.safe.global",
    100: "https://safe-transaction-gnosis-chain.safe.global",
    8453: "https://safe-transaction-base.safe.global",
  };

  const url = apiUrls[chainId];
  if (!url) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  return url;
}

/**
 * Get chain name from chain ID
 */
export function getChainName(chainId: number): string {
  const chainNames: Record<number, string> = {
    1: "Ethereum Mainnet",
    5: "Goerli",
    11155111: "Sepolia",
    137: "Polygon",
    42161: "Arbitrum One",
    10: "Optimism",
    100: "Gnosis Chain",
    8453: "Base",
  };

  return chainNames[chainId] || `Chain ${chainId}`;
}
