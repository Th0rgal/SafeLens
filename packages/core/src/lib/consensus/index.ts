import { getNetworkCapability } from "../networks/capabilities";
import {
  fetchConsensusProof as fetchBeaconConsensusProof,
  BEACON_NETWORKS,
  CHAIN_ID_TO_BEACON_NETWORK,
  DEFAULT_BEACON_RPC_URLS,
  type FetchConsensusProofOptions,
  type BeaconNetworkConfig,
} from "./beacon-api";
import type { ConsensusProof } from "../types";

export {
  BEACON_NETWORKS,
  CHAIN_ID_TO_BEACON_NETWORK,
  DEFAULT_BEACON_RPC_URLS,
  type FetchConsensusProofOptions,
  type BeaconNetworkConfig,
};

export const UNSUPPORTED_CONSENSUS_MODE_ERROR_CODE =
  "unsupported-consensus-mode" as const;

export class UnsupportedConsensusModeError extends Error {
  readonly code = UNSUPPORTED_CONSENSUS_MODE_ERROR_CODE;

  constructor(
    readonly chainId: number,
    readonly consensusMode: "opstack" | "linea"
  ) {
    super(
      `Consensus mode '${consensusMode}' is not implemented for chain ID ${chainId}.`
    );
    this.name = "UnsupportedConsensusModeError";
  }
}

/**
 * Fetch a consensus proof for a chain using explicit mode routing.
 * Beacon is implemented; opstack/linea are routed to deterministic
 * unsupported-mode errors until those verifier paths are added.
 */
export async function fetchConsensusProof(
  chainId: number,
  options: FetchConsensusProofOptions = {}
): Promise<ConsensusProof> {
  const capability = getNetworkCapability(chainId);

  if (!capability?.consensusMode) {
    throw new Error(
      `No consensus verification path is configured for chain ID ${chainId}.`
    );
  }

  if (capability.consensusMode === "beacon") {
    return fetchBeaconConsensusProof(chainId, options);
  }

  throw new UnsupportedConsensusModeError(chainId, capability.consensusMode);
}
