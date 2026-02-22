import type { Deployment, ERC7730Descriptor } from "../erc7730/types";
import { bundledDescriptors } from "../erc7730/descriptors/index";
import { buildBuiltinTokenMap } from "../erc7730/default-tokens";
import type { SettingsConfig, ChainConfig, AddressRegistryEntry } from "./types";

export const CLEAR_SIGNING_REGISTRY_COMMIT = "eeaceef158f27730157d97e649d4b5671f293426";
export const CLEAR_SIGNING_REGISTRY_URL =
  `https://github.com/LedgerHQ/clear-signing-erc7730-registry/tree/${CLEAR_SIGNING_REGISTRY_COMMIT}`;
export const COW_COMPOSABLE_COW_COMMIT = "471ca59aa95da1bbf3b03e002de96449bc78e6f0";
export const COW_COMPOSABLE_COW_NETWORKS_URL =
  `https://github.com/cowprotocol/composable-cow/blob/${COW_COMPOSABLE_COW_COMMIT}/networks.json`;

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

const KNOWN_NATIVE_SYMBOLS: Record<number, string> = {
  1: "ETH",
  10: "ETH",
  56: "BNB",
  100: "DAI",
  137: "POL",
  146: "S",
  250: "FTM",
  324: "ETH",
  8453: "ETH",
  8217: "KLAY",
  42220: "CELO",
  43114: "AVAX",
  59144: "ETH",
  81457: "ETH",
  42161: "ETH",
  1313161554: "ETH",
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
      .map((chainId) => [
        String(chainId),
        {
          name: KNOWN_CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
          nativeTokenSymbol: KNOWN_NATIVE_SYMBOLS[chainId] ?? "ETH",
        },
      ])
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

  const aliasEntries: AddressRegistryEntry[] = [
    {
      address: "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74",
      name: "CoW ComposableCoW",
      kind: "contract",
      group: "Builtin Protocols",
      chainIds: [1],
      note: `Source: CoW Protocol composable-cow deployments @ ${COW_COMPOSABLE_COW_COMMIT}`,
      sourceUrl: COW_COMPOSABLE_COW_NETWORKS_URL,
    },
    {
      address: "0x52eD56Da04309Aca4c3FECC595298d80C2f16BAc",
      name: "CoW CurrentBlockTimestampFactory",
      kind: "contract",
      group: "Builtin Protocols",
      chainIds: [1],
      note: `Source: CoW Protocol composable-cow deployments @ ${COW_COMPOSABLE_COW_COMMIT}`,
      sourceUrl: COW_COMPOSABLE_COW_NETWORKS_URL,
    },
  ];

  const descriptorBackedEntries = Array.from(entries.values())
    .map((entry) => ({
      address: entry.address,
      name: entry.name,
      kind: "contract" as const,
      group: "Builtin Protocols",
      chainIds: Array.from(entry.chainIds).sort((a, b) => a - b),
      note: `Source: Ledger ERC-7730 clear-signing registry (${Array.from(entry.owners).sort().join(", ")}) @ ${CLEAR_SIGNING_REGISTRY_COMMIT}`,
      sourceUrl: CLEAR_SIGNING_REGISTRY_URL,
    }))
    .filter(
      (entry) => !aliasEntries.some(
        (alias) =>
          alias.address.toLowerCase() === entry.address.toLowerCase()
          && alias.name === entry.name
      )
    );

  return [...descriptorBackedEntries, ...aliasEntries]
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
