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
export const COW_CONTRACTS_COMMIT = "c94c595a791681cf8ba7495117dcde397b932885";
export const COW_CONTRACTS_NETWORKS_URL =
  `https://github.com/cowprotocol/contracts/blob/${COW_CONTRACTS_COMMIT}/networks.json`;
export const SAFE_DEPLOYMENTS_COMMIT = "28fba1f7fb2c97511ea0429dd3ee585b76b3b731";
export const SAFE_DEPLOYMENTS_V141_URL =
  `https://github.com/safe-global/safe-deployments/tree/${SAFE_DEPLOYMENTS_COMMIT}/src/assets/v1.4.1`;

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

  const supportedChainIds = new Set<number>();
  for (const descriptor of descriptors) {
    for (const deployment of getDeployments(descriptor)) {
      supportedChainIds.add(deployment.chainId);
    }
  }

  const cowComposableChainIds = [1, 56, 100, 232, 9745, 42161, 59144, 11155111];
  const cowContractsChainIds = [1, 4, 5, 10, 56, 100, 137, 8453, 42161, 43114, 11155111];
  const safeV141ChainIds = [
    1, 10, 56, 100, 137, 146, 250, 324, 8217, 8453, 42161, 42220, 43114, 59144, 81457, 84532,
    421614, 560048, 11155111, 11155420, 1313161554,
  ];

  const aliasEntries: AddressRegistryEntry[] = [
    {
      address: "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74",
      name: "CoW ComposableCoW",
      chainIds: cowComposableChainIds,
      note: `Source: CoW Protocol composable-cow deployments @ ${COW_COMPOSABLE_COW_COMMIT}`,
      sourceUrl: COW_COMPOSABLE_COW_NETWORKS_URL,
    },
    {
      address: "0x52eD56Da04309Aca4c3FECC595298d80C2f16BAc",
      name: "CoW CurrentBlockTimestampFactory",
      chainIds: cowComposableChainIds,
      note: `Source: CoW Protocol composable-cow deployments @ ${COW_COMPOSABLE_COW_COMMIT}`,
      sourceUrl: COW_COMPOSABLE_COW_NETWORKS_URL,
    },
    {
      address: "0x2f55e8b20D0B9FEFA187AA7d00B6Cbe563605bF5",
      name: "CoW ExtensibleFallbackHandler",
      chainIds: cowComposableChainIds,
      note: `Source: CoW Protocol composable-cow deployments @ ${COW_COMPOSABLE_COW_COMMIT}`,
      sourceUrl: COW_COMPOSABLE_COW_NETWORKS_URL,
    },
    {
      address: "0xdAF33924925e03c9cc3A10D434016D6cfaD0aDd5",
      name: "CoW GoodAfterTime",
      chainIds: cowComposableChainIds,
      note: `Source: CoW Protocol composable-cow deployments @ ${COW_COMPOSABLE_COW_COMMIT}`,
      sourceUrl: COW_COMPOSABLE_COW_NETWORKS_URL,
    },
    {
      address: "0x519BA24E959e33B3B6220CA98BDe353D8C2D8992",
      name: "CoW PerpetualStableSwap",
      chainIds: cowComposableChainIds,
      note: `Source: CoW Protocol composable-cow deployments @ ${COW_COMPOSABLE_COW_COMMIT}`,
      sourceUrl: COW_COMPOSABLE_COW_NETWORKS_URL,
    },
    {
      address: "0x412C36e5011cD2517016d243A2DfB37f73a242e7",
      name: "CoW StopLoss",
      chainIds: cowComposableChainIds,
      note: `Source: CoW Protocol composable-cow deployments @ ${COW_COMPOSABLE_COW_COMMIT}`,
      sourceUrl: COW_COMPOSABLE_COW_NETWORKS_URL,
    },
    {
      address: "0x6cF1e9CA41F7611DEF408122793C358A3D11E5a5",
      name: "CoW TWAP",
      chainIds: cowComposableChainIds,
      note: `Source: CoW Protocol composable-cow deployments @ ${COW_COMPOSABLE_COW_COMMIT}`,
      sourceUrl: COW_COMPOSABLE_COW_NETWORKS_URL,
    },
    {
      address: "0x812308712a6D1367F437e1C1E4AF85c854e1e9F6",
      name: "CoW TradeAboveThreshold",
      chainIds: cowComposableChainIds,
      note: `Source: CoW Protocol composable-cow deployments @ ${COW_COMPOSABLE_COW_COMMIT}`,
      sourceUrl: COW_COMPOSABLE_COW_NETWORKS_URL,
    },
    {
      address: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
      name: "CoW GPv2Settlement",
      chainIds: cowContractsChainIds,
      note: `Source: CoW Protocol contracts deployments @ ${COW_CONTRACTS_COMMIT}`,
      sourceUrl: COW_CONTRACTS_NETWORKS_URL,
    },
    {
      address: "0xC92E8bdf79f0507f65A392b0ab4667716BFE0110",
      name: "CoW GPv2VaultRelayer",
      chainIds: cowContractsChainIds,
      note: `Source: CoW Protocol contracts deployments @ ${COW_CONTRACTS_COMMIT}`,
      sourceUrl: COW_CONTRACTS_NETWORKS_URL,
    },
    {
      address: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
      name: "Safe",
      chainIds: safeV141ChainIds,
      note: `Source: Safe deployments v1.4.1 assets @ ${SAFE_DEPLOYMENTS_COMMIT}`,
      sourceUrl: SAFE_DEPLOYMENTS_V141_URL,
    },
    {
      address: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
      name: "SafeProxyFactory",
      chainIds: safeV141ChainIds,
      note: `Source: Safe deployments v1.4.1 assets @ ${SAFE_DEPLOYMENTS_COMMIT}`,
      sourceUrl: SAFE_DEPLOYMENTS_V141_URL,
    },
    {
      address: "0x38869bf66a61cF6bDB996A6AE40D5853fD43B526",
      name: "MultiSend",
      chainIds: safeV141ChainIds,
      note: `Source: Safe deployments v1.4.1 assets @ ${SAFE_DEPLOYMENTS_COMMIT}`,
      sourceUrl: SAFE_DEPLOYMENTS_V141_URL,
    },
    {
      address: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
      name: "MultiSendCallOnly",
      chainIds: safeV141ChainIds,
      note: `Source: Safe deployments v1.4.1 assets @ ${SAFE_DEPLOYMENTS_COMMIT}`,
      sourceUrl: SAFE_DEPLOYMENTS_V141_URL,
    },
    {
      address: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
      name: "CompatibilityFallbackHandler",
      chainIds: safeV141ChainIds,
      note: `Source: Safe deployments v1.4.1 assets @ ${SAFE_DEPLOYMENTS_COMMIT}`,
      sourceUrl: SAFE_DEPLOYMENTS_V141_URL,
    },
    {
      address: "0xd53cd0aB83D845Ac265BE939c57F53AD838012c9",
      name: "SignMessageLib",
      chainIds: safeV141ChainIds,
      note: `Source: Safe deployments v1.4.1 assets @ ${SAFE_DEPLOYMENTS_COMMIT}`,
      sourceUrl: SAFE_DEPLOYMENTS_V141_URL,
    },
    {
      address: "0x9b35Af71d77eaf8d7e40252370304687390A1A52",
      name: "CreateCall",
      chainIds: safeV141ChainIds,
      note: `Source: Safe deployments v1.4.1 assets @ ${SAFE_DEPLOYMENTS_COMMIT}`,
      sourceUrl: SAFE_DEPLOYMENTS_V141_URL,
    },
    {
      address: "0x3d4Ba2E0884aa488718476ca2fB8EfC291A46199",
      name: "SimulateTxAccessor",
      chainIds: safeV141ChainIds,
      note: `Source: Safe deployments v1.4.1 assets @ ${SAFE_DEPLOYMENTS_COMMIT}`,
      sourceUrl: SAFE_DEPLOYMENTS_V141_URL,
    },
  ].map((entry) => ({
    ...entry,
    kind: "contract" as const,
    group: "Builtin Protocols",
    chainIds: entry.chainIds.filter((chainId) => supportedChainIds.has(chainId)).sort((a, b) => a - b),
  })).filter((entry) => entry.chainIds.length > 0);

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
