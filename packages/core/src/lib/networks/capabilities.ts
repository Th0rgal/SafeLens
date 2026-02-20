export const CONSENSUS_NETWORKS = ["mainnet", "sepolia", "gnosis"] as const;

export type ConsensusNetwork = (typeof CONSENSUS_NETWORKS)[number];

export interface BeaconConsensusConfig {
  network: ConsensusNetwork;
  genesisRoot: string;
  genesisTime: number;
  secondsPerSlot: number;
  slotsPerEpoch: number;
  epochsPerSyncCommitteePeriod: number;
  defaultBeaconRpcUrl: string;
}

export interface NetworkCapability {
  chainId: number;
  chainPrefix: string;
  chainName: string;
  safeApiUrl: string;
  defaultRpcUrl?: string;
  supportsOnchainPolicyProof: boolean;
  supportsSimulation: boolean;
  consensus?: BeaconConsensusConfig;
  enabledInSafeAddressSearch: boolean;
}

const NETWORK_CAPABILITIES_LIST: readonly NetworkCapability[] = [
  {
    chainId: 1,
    chainPrefix: "eth",
    chainName: "Ethereum Mainnet",
    safeApiUrl: "https://safe-transaction-mainnet.safe.global",
    defaultRpcUrl: "https://ethereum-rpc.publicnode.com",
    supportsOnchainPolicyProof: true,
    supportsSimulation: true,
    consensus: {
      network: "mainnet",
      genesisRoot:
        "0x4b363db94e286120d76eb905340fdd4e54bfe9f06bf33ff6cf5ad27f511bfe95",
      genesisTime: 1606824023,
      secondsPerSlot: 12,
      slotsPerEpoch: 32,
      epochsPerSyncCommitteePeriod: 256,
      defaultBeaconRpcUrl: "https://lodestar-mainnet.chainsafe.io",
    },
    enabledInSafeAddressSearch: true,
  },
  {
    chainId: 11155111,
    chainPrefix: "sep",
    chainName: "Sepolia",
    safeApiUrl: "https://safe-transaction-sepolia.safe.global",
    defaultRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    supportsOnchainPolicyProof: true,
    supportsSimulation: true,
    consensus: {
      network: "sepolia",
      genesisRoot:
        "0xd8ea171f3c94aea21ebc42a1ed61052acf3f9209c00e4efbaaddac09ed9b8078",
      genesisTime: 1655733600,
      secondsPerSlot: 12,
      slotsPerEpoch: 32,
      epochsPerSyncCommitteePeriod: 256,
      defaultBeaconRpcUrl: "https://lodestar-sepolia.chainsafe.io",
    },
    enabledInSafeAddressSearch: true,
  },
  {
    chainId: 137,
    chainPrefix: "matic",
    chainName: "Polygon",
    safeApiUrl: "https://safe-transaction-polygon.safe.global",
    defaultRpcUrl: "https://polygon-bor-rpc.publicnode.com",
    supportsOnchainPolicyProof: true,
    supportsSimulation: true,
    enabledInSafeAddressSearch: true,
  },
  {
    chainId: 42161,
    chainPrefix: "arb1",
    chainName: "Arbitrum One",
    safeApiUrl: "https://safe-transaction-arbitrum.safe.global",
    defaultRpcUrl: "https://arbitrum-one-rpc.publicnode.com",
    supportsOnchainPolicyProof: true,
    supportsSimulation: true,
    enabledInSafeAddressSearch: true,
  },
  {
    chainId: 10,
    chainPrefix: "oeth",
    chainName: "Optimism",
    safeApiUrl: "https://safe-transaction-optimism.safe.global",
    defaultRpcUrl: "https://optimism-rpc.publicnode.com",
    supportsOnchainPolicyProof: true,
    supportsSimulation: true,
    enabledInSafeAddressSearch: true,
  },
  {
    chainId: 100,
    chainPrefix: "gno",
    chainName: "Gnosis Chain",
    safeApiUrl: "https://safe-transaction-gnosis-chain.safe.global",
    defaultRpcUrl: "https://gnosis-rpc.publicnode.com",
    supportsOnchainPolicyProof: true,
    supportsSimulation: true,
    consensus: {
      network: "gnosis",
      genesisRoot:
        "0xf5dcb5564e829aab27264b9becd5dfaa017085611224cb3036f573368dbb9d47",
      genesisTime: 1638993340,
      secondsPerSlot: 5,
      slotsPerEpoch: 16,
      epochsPerSyncCommitteePeriod: 256,
      defaultBeaconRpcUrl: "https://rpc.gnosischain.com/beacon",
    },
    enabledInSafeAddressSearch: true,
  },
  {
    chainId: 8453,
    chainPrefix: "base",
    chainName: "Base",
    safeApiUrl: "https://safe-transaction-base.safe.global",
    defaultRpcUrl: "https://base-rpc.publicnode.com",
    supportsOnchainPolicyProof: true,
    supportsSimulation: true,
    enabledInSafeAddressSearch: true,
  },
  // Legacy Safe chain prefix retained for URL parsing compatibility.
  {
    chainId: 5,
    chainPrefix: "gor",
    chainName: "Goerli",
    safeApiUrl: "https://safe-transaction-goerli.safe.global",
    supportsOnchainPolicyProof: false,
    supportsSimulation: false,
    enabledInSafeAddressSearch: false,
  },
] as const;

export const NETWORK_CAPABILITIES_BY_CHAIN_ID: Record<number, NetworkCapability> =
  Object.fromEntries(
    NETWORK_CAPABILITIES_LIST.map((network) => [network.chainId, network])
  );

export const NETWORK_CAPABILITIES_BY_PREFIX: Record<string, NetworkCapability> =
  Object.fromEntries(
    NETWORK_CAPABILITIES_LIST.map((network) => [network.chainPrefix, network])
  );

export const SAFE_ADDRESS_SEARCH_CHAIN_IDS = NETWORK_CAPABILITIES_LIST.filter(
  (network) => network.enabledInSafeAddressSearch
).map((network) => network.chainId) as readonly number[];

export const CONSENSUS_SUPPORTED_CHAIN_IDS = NETWORK_CAPABILITIES_LIST.filter(
  (network) => Boolean(network.consensus)
).map((network) => network.chainId) as readonly number[];

export function getNetworkCapability(chainId: number): NetworkCapability | null {
  return NETWORK_CAPABILITIES_BY_CHAIN_ID[chainId] ?? null;
}

export function getNetworkCapabilityByPrefix(prefix: string): NetworkCapability | null {
  return NETWORK_CAPABILITIES_BY_PREFIX[prefix] ?? null;
}
