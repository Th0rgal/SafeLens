import { SafeUrlData, SafeUrlParseResult } from "../types";

const CHAIN_PREFIX_MAP: Record<string, number> = {
  eth: 1,
  gor: 5,
  sep: 11155111,
  matic: 137,
  arb1: 42161,
  oeth: 10,
  gno: 100,
  base: 8453,
};

interface ParsedSafeUrlComponents {
  chainId: number;
  safeAddress: string;
  safeTxHash?: string;
}

function parseSafeUrlComponents(urlString: string): ParsedSafeUrlComponents {
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
    return { chainId, safeAddress };
  }

  const parts = idParam.split("_");
  if (parts.length !== 3 || parts[0] !== "multisig") {
    throw new Error("Invalid 'id' parameter format. Expected format: 'multisig_{address}_{hash}'");
  }

  const safeTxHash = parts[2];
  if (!/^0x[a-fA-F0-9]{64}$/.test(safeTxHash)) {
    throw new Error("Invalid Safe transaction hash format");
  }

  return { chainId, safeAddress, safeTxHash };
}

function wrapParseError(error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`Failed to parse Safe URL: ${error.message}`);
  }
  return new Error("Failed to parse Safe URL");
}

export function parseSafeUrl(urlString: string): SafeUrlData {
  try {
    const parsed = parseSafeUrlComponents(urlString);
    if (!parsed.safeTxHash) {
      throw new Error("Missing 'id' parameter in URL");
    }
    return {
      chainId: parsed.chainId,
      safeAddress: parsed.safeAddress,
      safeTxHash: parsed.safeTxHash,
    };
  } catch (error) {
    throw wrapParseError(error);
  }
}

export function parseSafeUrlFlexible(urlString: string): SafeUrlParseResult {
  try {
    const parsed = parseSafeUrlComponents(urlString);
    if (parsed.safeTxHash) {
      return {
        type: "transaction",
        data: {
          chainId: parsed.chainId,
          safeAddress: parsed.safeAddress,
          safeTxHash: parsed.safeTxHash,
        },
      };
    }
    return { type: "queue", data: { chainId: parsed.chainId, safeAddress: parsed.safeAddress } };
  } catch (error) {
    throw wrapParseError(error);
  }
}

export function getChainPrefix(chainId: number): string {
  const entry = Object.entries(CHAIN_PREFIX_MAP).find(([, id]) => id === chainId);
  if (!entry) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return entry[0];
}

export const SUPPORTED_CHAIN_IDS = [1, 11155111, 137, 42161, 10, 100, 8453] as const;

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
