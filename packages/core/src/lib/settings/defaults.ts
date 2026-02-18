import type { Deployment, ERC7730Descriptor } from "../erc7730/types";
import { bundledDescriptors } from "../erc7730/descriptors/index";
import { buildBuiltinTokenMap } from "../erc7730/default-tokens";
import type { SettingsConfig, ChainConfig, AddressRegistryEntry } from "./types";

export const CLEAR_SIGNING_REGISTRY_COMMIT = "eeaceef158f27730157d97e649d4b5671f293426";
export const CLEAR_SIGNING_REGISTRY_URL =
  `https://github.com/LedgerHQ/clear-signing-erc7730-registry/tree/${CLEAR_SIGNING_REGISTRY_COMMIT}`;

const KNOWN_CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BNB Chain",
  100: "Gnosis",
  137: "Polygon",
  146: "Sonic",
  250: "Fantom",
  324: "zkSync Era",
  8453: "Base",
  8217: "Klaytn",
  42220: "Celo",
  43114: "Avalanche",
  59144: "Linea",
  80001: "Polygon Mumbai",
  81457: "Blast",
  84532: "Base Sepolia",
  42161: "Arbitrum One",
  421614: "Arbitrum Sepolia",
  560048: "Hoodi",
  11155111: "Sepolia",
  1313161554: "Aurora",
  11155420: "Optimism Sepolia",
};

function getDeployments(descriptor: ERC7730Descriptor): Deployment[] {
  return [
    ...(descriptor.context.contract?.deployments ?? []),
    ...(descriptor.context.eip712?.deployments ?? []),
  ];
}

function buildChains(descriptors: ERC7730Descriptor[]): Record<string, ChainConfig> {
  const chainIds = new Set<number>();

  for (const descriptor of descriptors) {
    for (const deployment of getDeployments(descriptor)) {
      chainIds.add(deployment.chainId);
    }
  }

  return Object.fromEntries(
    Array.from(chainIds)
      .sort((a, b) => a - b)
      .map((chainId) => [String(chainId), { name: KNOWN_CHAIN_NAMES[chainId] ?? `Chain ${chainId}` }])
  );
}

function buildBuiltinProtocolEntries(descriptors: ERC7730Descriptor[]): AddressRegistryEntry[] {
  const entries = new Map<string, {
    address: string;
    name: string;
    chainIds: Set<number>;
    owners: Set<string>;
  }>();

  for (const descriptor of descriptors) {
    const name = descriptor.metadata.owner;
    if (!name) continue;

    for (const deployment of getDeployments(descriptor)) {
      const key = `${deployment.address.toLowerCase()}:${name}`;
      const existing = entries.get(key);
      if (existing) {
        existing.chainIds.add(deployment.chainId);
        existing.owners.add(descriptor.metadata.owner);
      } else {
        entries.set(key, {
          address: deployment.address,
          name,
          chainIds: new Set([deployment.chainId]),
          owners: new Set([descriptor.metadata.owner]),
        });
      }
    }
  }

  return Array.from(entries.values())
    .map((entry) => ({
      address: entry.address,
      name: entry.name,
      kind: "contract" as const,
      group: "Builtin Protocols",
      chainIds: Array.from(entry.chainIds).sort((a, b) => a - b),
      note: `Source: Ledger ERC-7730 clear-signing registry (${Array.from(entry.owners).sort().join(", ")}) @ ${CLEAR_SIGNING_REGISTRY_COMMIT}`,
      sourceUrl: CLEAR_SIGNING_REGISTRY_URL,
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name) || a.address.toLowerCase().localeCompare(b.address.toLowerCase())
    );
}

function buildBuiltinTokenEntries(descriptors: ERC7730Descriptor[]): AddressRegistryEntry[] {
  const grouped = new Map<string, {
    address: string;
    symbol: string;
    decimals: number;
    chainIds: Set<number>;
  }>();

  for (const [key, token] of buildBuiltinTokenMap(descriptors).entries()) {
    const [chainIdRaw, address] = key.split(":");
    const chainId = Number.parseInt(chainIdRaw, 10);
    if (!Number.isFinite(chainId)) continue;

    const tokenKey = `${address}:${token.symbol}:${token.decimals}`;
    const existing = grouped.get(tokenKey);
    if (existing) {
      existing.chainIds.add(chainId);
    } else {
      grouped.set(tokenKey, {
        address,
        symbol: token.symbol,
        decimals: token.decimals,
        chainIds: new Set([chainId]),
      });
    }
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      address: entry.address,
      name: entry.symbol,
      kind: "contract" as const,
      group: "Builtin Tokens",
      chainIds: Array.from(entry.chainIds).sort((a, b) => a - b),
      tokenSymbol: entry.symbol,
      tokenDecimals: entry.decimals,
      note: `Source: Ledger ERC-7730 clear-signing registry + built-in token overrides @ ${CLEAR_SIGNING_REGISTRY_COMMIT}`,
      sourceUrl: CLEAR_SIGNING_REGISTRY_URL,
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name) || a.address.toLowerCase().localeCompare(b.address.toLowerCase())
    );
}

const registryDescriptors = bundledDescriptors as unknown as ERC7730Descriptor[];

/**
 * Default settings are derived from the bundled ERC-7730 registry snapshot.
 *
 * Contract names and chain coverage come from descriptor metadata + deployments,
 * avoiding manual address curation.
 */
export const DEFAULT_SETTINGS_CONFIG: SettingsConfig = {
  version: "1.0",
  erc7730Descriptors: bundledDescriptors as SettingsConfig["erc7730Descriptors"],
  disabledInterpreters: [],
  chains: buildChains(registryDescriptors),
  addressRegistry: [
    ...buildBuiltinProtocolEntries(registryDescriptors),
    ...buildBuiltinTokenEntries(registryDescriptors),
  ],
};
