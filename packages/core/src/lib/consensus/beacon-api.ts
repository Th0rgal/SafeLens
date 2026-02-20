/**
 * Beacon Chain Light Client API fetcher.
 *
 * Fetches bootstrap, updates, and finality_update from a beacon chain RPC,
 * which are needed for offline consensus verification via Helios.
 *
 * Beacon API spec: https://ethereum.github.io/beacon-APIs/
 */

import type { ConsensusProof } from "../types";
import {
  CONSENSUS_NETWORKS,
  type ConsensusNetwork,
  CONSENSUS_SUPPORTED_CHAIN_IDS,
  NETWORK_CAPABILITIES_BY_CHAIN_ID,
} from "../networks/capabilities";

/** Network-specific configuration for beacon chain consensus. */
export interface BeaconNetworkConfig {
  network: ConsensusNetwork;
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

/** Known network configs sourced from the shared capability matrix. */
export const BEACON_NETWORKS: Record<ConsensusNetwork, BeaconNetworkConfig> =
  Object.fromEntries(
    CONSENSUS_NETWORKS.map((networkName) => {
      const network = Object.values(NETWORK_CAPABILITIES_BY_CHAIN_ID).find(
        (entry) => entry.consensus?.network === networkName
      );
      if (!network?.consensus) {
        throw new Error(`Missing consensus capability config for ${networkName}`);
      }
      return [
        networkName,
        {
          network: network.consensus.network,
          genesisRoot: network.consensus.genesisRoot,
          genesisTime: network.consensus.genesisTime,
          secondsPerSlot: network.consensus.secondsPerSlot,
          slotsPerEpoch: network.consensus.slotsPerEpoch,
          epochsPerSyncCommitteePeriod:
            network.consensus.epochsPerSyncCommitteePeriod,
        } satisfies BeaconNetworkConfig,
      ];
    })
  ) as Record<ConsensusNetwork, BeaconNetworkConfig>;

/** Map chainId to beacon network name using shared capabilities. */
export const CHAIN_ID_TO_BEACON_NETWORK: Record<number, ConsensusNetwork> =
  Object.fromEntries(
    CONSENSUS_SUPPORTED_CHAIN_IDS.map((chainId) => {
      const capability = NETWORK_CAPABILITIES_BY_CHAIN_ID[chainId];
      if (!capability?.consensus) {
        throw new Error(`Missing consensus network for chain ${chainId}`);
      }
      return [chainId, capability.consensus.network];
    })
  ) as Record<number, ConsensusNetwork>;

/** Default public beacon chain RPC endpoints sourced from shared capabilities. */
export const DEFAULT_BEACON_RPC_URLS: Record<ConsensusNetwork, string> =
  Object.fromEntries(
    CONSENSUS_NETWORKS.map((networkName) => {
      const network = Object.values(NETWORK_CAPABILITIES_BY_CHAIN_ID).find(
        (entry) => entry.consensus?.network === networkName
      );
      if (!network?.consensus?.defaultBeaconRpcUrl) {
        throw new Error(`Missing beacon RPC URL for consensus network ${networkName}`);
      }
      return [networkName, network.consensus.defaultBeaconRpcUrl];
    })
  ) as Record<ConsensusNetwork, string>;

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
    const consensusChains = CONSENSUS_SUPPORTED_CHAIN_IDS.join(", ");
    throw new Error(
      `No beacon chain config for chain ID ${chainId}. Consensus proofs are supported on chain IDs: ${consensusChains}.`
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
