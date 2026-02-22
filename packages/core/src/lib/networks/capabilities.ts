export const CONSENSUS_NETWORKS = [
  "mainnet",
  "sepolia",
  "holesky",
  "hoodi",
  "gnosis",
] as const;

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

export type ConsensusVerifierMode = "beacon" | "opstack" | "linea";

export interface NetworkCapabilityBase {
  chainId: number;
  chainPrefix: string;
  chainName: string;
  safeApiUrl: string;
  defaultRpcUrl?: string;
  supportsOnchainPolicyProof: boolean;
  supportsSimulation: boolean;
  enabledInSafeAddressSearch: boolean;
}

export interface BeaconNetworkCapability extends NetworkCapabilityBase {
  consensusMode: "beacon";
  consensus: BeaconConsensusConfig;
}

export interface OpStackNetworkCapability extends NetworkCapabilityBase {
  consensusMode: "opstack";
}

export interface LineaNetworkCapability extends NetworkCapabilityBase {
  consensusMode: "linea";
}

export interface NoConsensusModeCapability extends NetworkCapabilityBase {
  consensusMode?: undefined;
  consensus?: undefined;
}

export type NetworkCapability =
  | BeaconNetworkCapability
  | OpStackNetworkCapability
  | LineaNetworkCapability
  | NoConsensusModeCapability;

const NETWORK_CAPABILITIES_LIST: readonly NetworkCapability[] = [
  {
    chainId: 1,
    chainPrefix: "eth",
    chainName: "Ethereum Mainnet",
    safeApiUrl: "https://safe-transaction-mainnet.safe.global",
    defaultRpcUrl: "https://ethereum-rpc.publicnode.com",
    supportsOnchainPolicyProof: true,
    supportsSimulation: true,
    consensusMode: "beacon",
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
    consensusMode: "beacon",
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
    chainId: 17000,
    chainPrefix: "hol",
    chainName: "Holesky",
    safeApiUrl: "https://safe-transaction-holesky.safe.global",
    defaultRpcUrl: "https://ethereum-holesky-rpc.publicnode.com",
    supportsOnchainPolicyProof: true,
    supportsSimulation: true,
    consensusMode: "beacon",
    consensus: {
      network: "holesky",
      genesisRoot:
        "0x9143aa7c615a7f7115e2b6aac319c03529df8242ae705fba9df39b79c59fa8b1",
      genesisTime: 1695902400,
      secondsPerSlot: 12,
      slotsPerEpoch: 32,
      epochsPerSyncCommitteePeriod: 256,
      defaultBeaconRpcUrl: "https://ethereum-holesky-beacon-api.publicnode.com",
    },
    enabledInSafeAddressSearch: false,
  },
  {
    chainId: 560048,
    chainPrefix: "hdi",
    chainName: "Hoodi",
    safeApiUrl: "https://safe-transaction-hoodi.safe.global",
    defaultRpcUrl: "https://ethereum-hoodi-rpc.publicnode.com",
    supportsOnchainPolicyProof: true,
    supportsSimulation: true,
    consensusMode: "beacon",
    consensus: {
      network: "hoodi",
      genesisRoot:
        "0x212f13fc4df078b6cb7db228f1c8307566dcecf900867401a92023d7ba99cb5f",
      genesisTime: 1742213400,
      secondsPerSlot: 12,
      slotsPerEpoch: 32,
      epochsPerSyncCommitteePeriod: 256,
      defaultBeaconRpcUrl: "https://ethereum-hoodi-beacon-api.publicnode.com",
    },
    enabledInSafeAddressSearch: false,
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
    consensusMode: "opstack",
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
    consensusMode: "beacon",
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
    consensusMode: "opstack",
    enabledInSafeAddressSearch: true,
  },
  {
    chainId: 59144,
    chainPrefix: "linea",
    chainName: "Linea",
    safeApiUrl: "https://safe-transaction-linea.safe.global",
    defaultRpcUrl: "https://linea-rpc.publicnode.com",
    supportsOnchainPolicyProof: true,
    supportsSimulation: true,
    consensusMode: "linea",
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

export const BEACON_CONSENSUS_SUPPORTED_CHAIN_IDS = NETWORK_CAPABILITIES_LIST.filter(
  (network) => network.consensusMode === "beacon" && Boolean(network.consensus)
).map((network) => network.chainId) as readonly number[];

export const EXECUTION_ENVELOPE_CONSENSUS_SUPPORTED_CHAIN_IDS =
  NETWORK_CAPABILITIES_LIST.filter(
    (network) =>
      network.consensusMode === "opstack" || network.consensusMode === "linea"
  ).map((network) => network.chainId) as readonly number[];

export const CONSENSUS_SUPPORTED_CHAIN_IDS = NETWORK_CAPABILITIES_LIST.filter(
  (network) => Boolean(network.consensusMode)
).map((network) => network.chainId) as readonly number[];

export function getNetworkCapability(chainId: number): NetworkCapability | null {
  return NETWORK_CAPABILITIES_BY_CHAIN_ID[chainId] ?? null;
}

export function getNetworkCapabilityByPrefix(prefix: string): NetworkCapability | null {
  return NETWORK_CAPABILITIES_BY_PREFIX[prefix] ?? null;
}
