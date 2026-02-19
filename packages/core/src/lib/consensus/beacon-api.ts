/**
 * Beacon Chain Light Client API fetcher.
 *
 * Fetches bootstrap, updates, and finality_update from a beacon chain RPC,
 * which are needed for offline consensus verification via Helios.
 *
 * Beacon API spec: https://ethereum.github.io/beacon-APIs/
 */

import type { ConsensusProof } from "../types";

/** Network-specific configuration for beacon chain consensus. */
export interface BeaconNetworkConfig {
  network: "mainnet" | "sepolia" | "holesky" | "gnosis";
  /** Genesis root for the beacon chain (hex, 0x-prefixed). */
  genesisRoot: string;
  /** Genesis time as unix timestamp (seconds). */
  genesisTime: number;
  /** Seconds per slot (12 for Ethereum, 5 for Gnosis). */
  secondsPerSlot: number;
  /** Slots per epoch. */
  slotsPerEpoch: number;
  /** Epochs per sync committee period. */
  epochsPerSyncCommitteePeriod: number;
}

/** Known network configs. */
export const BEACON_NETWORKS: Record<string, BeaconNetworkConfig> = {
  mainnet: {
    network: "mainnet",
    genesisRoot:
      "0x4b363db94e286120d76eb905340fdd4e54bfe9f06bf33ff6cf5ad27f511bfe95",
    genesisTime: 1606824023,
    secondsPerSlot: 12,
    slotsPerEpoch: 32,
    epochsPerSyncCommitteePeriod: 256,
  },
  gnosis: {
    network: "gnosis",
    genesisRoot:
      "0xf5dcb5564e829aab27264b9becd5dfaa017085611224cb3036f573368dbb9d47",
    genesisTime: 1638993340,
    secondsPerSlot: 5,
    slotsPerEpoch: 16,
    epochsPerSyncCommitteePeriod: 256,
  },
  sepolia: {
    network: "sepolia",
    genesisRoot:
      "0xd8ea171f3c94aea21ebc42a1ed61052acf3f9209c00e4efbaaddac09ed9b8078",
    genesisTime: 1655733600,
    secondsPerSlot: 12,
    slotsPerEpoch: 32,
    epochsPerSyncCommitteePeriod: 256,
  },
};

/** Map chainId to beacon network name. */
export const CHAIN_ID_TO_BEACON_NETWORK: Record<number, string> = {
  1: "mainnet",
  100: "gnosis",
  11155111: "sepolia",
};

/** Default public beacon chain RPC endpoints. */
export const DEFAULT_BEACON_RPC_URLS: Record<string, string> = {
  mainnet: "https://lodestar-mainnet.chainsafe.io",
  gnosis: "https://beacon.gnosischain.com",
  sepolia: "https://lodestar-sepolia.chainsafe.io",
};

export interface FetchConsensusProofOptions {
  /** Custom beacon chain RPC URL. Falls back to a public endpoint. */
  beaconRpcUrl?: string;
}

/**
 * Fetch a ConsensusProof from the beacon chain light client API.
 *
 * This fetches:
 * 1. The latest finality update (contains the signed finalized header)
 * 2. The bootstrap for the checkpoint matching the finalized header
 * 3. Any sync committee period updates needed between bootstrap and finality
 *
 * The resulting ConsensusProof can be bundled into an evidence package
 * and later verified offline by the Tauri backend using helios-consensus-core.
 */
export async function fetchConsensusProof(
  chainId: number,
  options: FetchConsensusProofOptions = {}
): Promise<ConsensusProof> {
  const networkName = CHAIN_ID_TO_BEACON_NETWORK[chainId];
  if (!networkName) {
    throw new Error(
      `No beacon chain config for chain ID ${chainId}. Consensus proofs are supported for Ethereum mainnet (1), Gnosis (100), and Sepolia (11155111).`
    );
  }

  const config = BEACON_NETWORKS[networkName];
  if (!config) {
    throw new Error(`Missing beacon network config for ${networkName}`);
  }

  const beaconRpc =
    options.beaconRpcUrl ??
    DEFAULT_BEACON_RPC_URLS[networkName];
  if (!beaconRpc) {
    throw new Error(
      `No beacon RPC URL for ${networkName}. Pass one via options.beaconRpcUrl.`
    );
  }

  const baseUrl = beaconRpc.replace(/\/+$/, "");

  // Step 1: Fetch the latest finality update
  const finalityUpdate = await fetchBeaconJson(
    `${baseUrl}/eth/v1/beacon/light_client/finality_update`
  );

  // Extract the finalized block root to use as the bootstrap checkpoint.
  // The finalized_header.beacon is a BeaconBlockHeader; we need its slot
  // to compute the checkpoint block root. But the bootstrap endpoint needs
  // a block_root, which is the tree_hash_root of the finalized beacon header.
  // Since we can't compute tree_hash_root in JS easily, we use a different
  // approach: fetch the bootstrap from the finalized header's slot.
  //
  // Actually, the beacon API bootstrap endpoint takes a block_root parameter.
  // We need to get the block root for the finalized header. The simplest way
  // is to query the beacon block header endpoint for the finalized header's slot.
  const finalizedSlot =
    finalityUpdate.data.finalized_header.beacon.slot;
  const finalizedBlockNumber =
    finalityUpdate.data.finalized_header.execution?.block_number;
  const finalizedStateRoot =
    finalityUpdate.data.finalized_header.execution?.state_root;

  if (!finalizedStateRoot || finalizedBlockNumber == null) {
    throw new Error(
      "Finality update does not contain an execution payload header (missing state_root or block_number). The beacon node may be pre-Capella."
    );
  }

  // Fetch the block root for the finalized slot
  const headerResponse = await fetchBeaconJson(
    `${baseUrl}/eth/v1/beacon/headers/${finalizedSlot}`
  );
  const checkpoint = headerResponse.data.root as string;

  // Step 2: Fetch bootstrap for this checkpoint
  const bootstrap = await fetchBeaconJson(
    `${baseUrl}/eth/v1/beacon/light_client/bootstrap/${checkpoint}`
  );

  // Step 3: Fetch any sync committee updates between the bootstrap and the
  // finality update's attested header.
  // Compute sync periods
  const slotsPerPeriod =
    config.slotsPerEpoch * config.epochsPerSyncCommitteePeriod;
  const bootstrapPeriod = Math.floor(
    Number(bootstrap.data.header.beacon.slot) / slotsPerPeriod
  );
  const attestedSlot =
    finalityUpdate.data.attested_header.beacon.slot;
  const attestedPeriod = Math.floor(Number(attestedSlot) / slotsPerPeriod);

  const updates: string[] = [];
  if (attestedPeriod > bootstrapPeriod) {
    const count = attestedPeriod - bootstrapPeriod;
    const updatesResponse = await fetchBeaconJson(
      `${baseUrl}/eth/v1/beacon/light_client/updates?start_period=${bootstrapPeriod + 1}&count=${Math.min(count, 128)}`
    );
    // The updates endpoint returns an array directly
    const updatesArray = Array.isArray(updatesResponse)
      ? updatesResponse
      : updatesResponse.data ?? updatesResponse;

    for (const update of updatesArray) {
      // Each update may be wrapped in { data: ... } or not
      const updateData = update.data ?? update;
      updates.push(JSON.stringify(updateData));
    }
  }

  const consensusProof: ConsensusProof = {
    checkpoint: checkpoint as `0x${string}`,
    bootstrap: JSON.stringify(bootstrap.data),
    updates,
    finalityUpdate: JSON.stringify(finalityUpdate.data),
    network: config.network,
    stateRoot: finalizedStateRoot as `0x${string}`,
    blockNumber: Number(finalizedBlockNumber),
    finalizedSlot: Number(finalizedSlot),
  };

  return consensusProof;
}

/** Fetch JSON from a beacon chain API endpoint with error handling. */
async function fetchBeaconJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Beacon API request failed: ${response.status} ${response.statusText} — ${url}\n${body}`
    );
  }

  return response.json();
}
