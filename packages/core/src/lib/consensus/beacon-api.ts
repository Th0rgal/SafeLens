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
  BEACON_CONSENSUS_SUPPORTED_CHAIN_IDS,
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
    BEACON_CONSENSUS_SUPPORTED_CHAIN_IDS.map((chainId) => {
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
 * Maximum number of retry attempts when the finality update straddles a sync
 * committee period boundary (attested header in period N+1 while the bootstrap
 * is still in period N). Re-fetching after a short delay usually resolves this
 * once finality advances past the boundary.
 */
const PERIOD_BOUNDARY_MAX_RETRIES = 3;

/**
 * Delay in milliseconds between retries when hitting a period boundary.
 * On Gnosis (5 s slots, 16 slots/epoch) an epoch is ~80 s; on Ethereum
 * (12 s slots, 32 slots/epoch) it is ~384 s. A 10 s delay gives the chain
 * time to finalize a new epoch while keeping total wait reasonable.
 */
const PERIOD_BOUNDARY_RETRY_DELAY_MS = 10_000;

/**
 * Fetch a ConsensusProof from the beacon chain light client API.
 *
 * This fetches:
 * 1. The latest finality update (contains the signed finalized header)
 * 2. The bootstrap for the checkpoint matching the finalized header
 * 3. Any sync committee period updates needed between bootstrap and finality
 *
 * When the finality update straddles a sync committee period boundary and
 * the beacon node cannot serve the required updates (common on Gnosis where
 * the public beacon node has limited light-client update history), the
 * function retries automatically to wait for finality to advance past the
 * boundary.
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
    const consensusChains = BEACON_CONSENSUS_SUPPORTED_CHAIN_IDS.join(", ");
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
  const slotsPerPeriod =
    config.slotsPerEpoch * config.epochsPerSyncCommitteePeriod;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= PERIOD_BOUNDARY_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, PERIOD_BOUNDARY_RETRY_DELAY_MS)
      );
    }

    const result = await fetchBeaconProofAttempt(baseUrl, config, slotsPerPeriod);

    // Happy path: bootstrap and attested header are in the same period.
    if (result.attestedPeriod <= result.bootstrapPeriod) {
      return buildConsensusProof(result, config);
    }

    // Period boundary: need sync committee updates to bridge the gap.
    // The update for period P contains next_sync_committee for period P+1,
    // so to go from bootstrapPeriod B to attestedPeriod A we need updates
    // for periods B through A−1 (start_period = B, count = A − B).
    const count = result.attestedPeriod - result.bootstrapPeriod;
    try {
      const updatesResponse = await fetchBeaconJson(
        `${baseUrl}/eth/v1/beacon/light_client/updates?start_period=${result.bootstrapPeriod}&count=${Math.min(count, 128)}`
      );
      const updatesArray = Array.isArray(updatesResponse)
        ? updatesResponse
        : updatesResponse.data ?? updatesResponse;

      const updates: string[] = [];
      for (const update of updatesArray) {
        const updateData = update.data ?? update;
        updates.push(JSON.stringify(updateData));
      }

      return buildConsensusProof(result, config, updates);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Retry: a fresh finality update may have advanced past the boundary.
    }
  }

  throw new Error(
    `Beacon light client sync committee updates unavailable after ${PERIOD_BOUNDARY_MAX_RETRIES} retries ` +
      `(bootstrap period and attested period are in different sync committee periods ` +
      `and the beacon node cannot serve the bridging updates). ` +
      `Last error: ${lastError?.message ?? "unknown"}`
  );
}

/** Intermediate result from a single beacon proof fetching attempt. */
interface BeaconProofAttemptResult {
  checkpoint: string;
  bootstrap: any;
  finalityUpdate: any;
  finalizedSlot: number;
  finalizedBlockNumber: number;
  finalizedStateRoot: string;
  bootstrapPeriod: number;
  attestedPeriod: number;
}

/** Fetch finality update, bootstrap, and compute sync committee periods. */
async function fetchBeaconProofAttempt(
  baseUrl: string,
  config: BeaconNetworkConfig,
  slotsPerPeriod: number,
): Promise<BeaconProofAttemptResult> {
  // Step 1: Fetch the latest finality update
  const finalityUpdate = await fetchBeaconJson(
    `${baseUrl}/eth/v1/beacon/light_client/finality_update`
  );

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

  // Step 2: Fetch a bootstrap checkpoint.
  // Some beacon nodes (e.g. Gnosis) only serve bootstrap data for
  // epoch-boundary block roots. Try the finalized slot's root first;
  // on 404 fall back to nearby epoch-boundary slots.
  const { checkpoint, bootstrap } = await fetchBootstrapWithFallback(
    baseUrl,
    Number(finalizedSlot),
    config.slotsPerEpoch,
  );

  // Compute sync periods
  const bootstrapPeriod = Math.floor(
    Number(bootstrap.data.header.beacon.slot) / slotsPerPeriod
  );
  const attestedSlot =
    finalityUpdate.data.attested_header.beacon.slot;
  const attestedPeriod = Math.floor(Number(attestedSlot) / slotsPerPeriod);

  return {
    checkpoint,
    bootstrap,
    finalityUpdate,
    finalizedSlot: Number(finalizedSlot),
    finalizedBlockNumber: Number(finalizedBlockNumber),
    finalizedStateRoot: finalizedStateRoot as string,
    bootstrapPeriod,
    attestedPeriod,
  };
}

/**
 * Try to fetch a bootstrap, falling back to epoch-boundary slots when the
 * beacon node returns 404 for the finalized slot's block root.
 *
 * Some beacon nodes only pre-compute the sync committee Merkle branch for
 * epoch-boundary blocks (the first slot of each epoch). When the finality
 * update's finalized header is not at an epoch boundary, the bootstrap
 * request returns 404. In that case we walk backward through recent epoch
 * boundaries until we find one the node supports.
 */
async function fetchBootstrapWithFallback(
  baseUrl: string,
  finalizedSlot: number,
  slotsPerEpoch: number,
): Promise<{ checkpoint: string; bootstrap: any }> {
  // Try the finalized slot directly first.
  const primaryRoot = await fetchHeaderRoot(baseUrl, finalizedSlot);
  try {
    const bootstrap = await fetchBeaconJson(
      `${baseUrl}/eth/v1/beacon/light_client/bootstrap/${primaryRoot}`
    );
    return { checkpoint: primaryRoot, bootstrap };
  } catch (err) {
    if (!isHttpNotFound(err)) throw err;
  }

  // Fall back to epoch-boundary slots (up to 3 preceding epoch boundaries).
  const epochBoundary =
    Math.floor(finalizedSlot / slotsPerEpoch) * slotsPerEpoch;
  const MAX_EPOCH_LOOKBACK = 3;

  for (let i = 0; i < MAX_EPOCH_LOOKBACK; i++) {
    const candidateSlot = epochBoundary - i * slotsPerEpoch;
    if (candidateSlot < 0) break;

    let root: string;
    try {
      root = await fetchHeaderRoot(baseUrl, candidateSlot);
    } catch {
      // Slot might be missed (404); try the previous epoch boundary.
      continue;
    }

    try {
      const bootstrap = await fetchBeaconJson(
        `${baseUrl}/eth/v1/beacon/light_client/bootstrap/${root}`
      );
      return { checkpoint: root, bootstrap };
    } catch (err) {
      if (!isHttpNotFound(err)) throw err;
      // This epoch boundary doesn't have bootstrap data either; keep searching.
    }
  }

  throw new Error(
    `No bootstrap available: the beacon node does not have light client bootstrap ` +
      `data for the finalized slot ${finalizedSlot} or nearby epoch boundaries. ` +
      `This is a known limitation of some beacon nodes (e.g. Gnosis Chain).`
  );
}

/** Fetch the block root for a given slot via the headers endpoint. */
async function fetchHeaderRoot(
  baseUrl: string,
  slot: number,
): Promise<string> {
  const response = await fetchBeaconJson(
    `${baseUrl}/eth/v1/beacon/headers/${slot}`
  );
  return response.data.root as string;
}

/** Check whether an error is an HTTP 404 from the beacon API. */
function isHttpNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes("404");
}

/** Assemble a ConsensusProof from the fetched beacon data. */
function buildConsensusProof(
  result: BeaconProofAttemptResult,
  config: BeaconNetworkConfig,
  updates: string[] = [],
): ConsensusProof {
  return {
    consensusMode: "beacon",
    checkpoint: result.checkpoint as `0x${string}`,
    bootstrap: JSON.stringify(result.bootstrap.data),
    updates,
    finalityUpdate: JSON.stringify(result.finalityUpdate.data),
    network: config.network,
    stateRoot: result.finalizedStateRoot as `0x${string}`,
    blockNumber: result.finalizedBlockNumber,
    finalizedSlot: result.finalizedSlot,
  };
}

/** Fetch JSON from a beacon chain API endpoint with error handling. */
async function fetchBeaconJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Beacon API request failed: ${response.status} ${response.statusText} - ${url}\n${body}`
    );
  }

  return response.json();
}
