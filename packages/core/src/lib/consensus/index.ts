import { getNetworkCapability } from "../networks/capabilities";
import {
  fetchConsensusProof as fetchBeaconConsensusProof,
  BEACON_NETWORKS,
  CHAIN_ID_TO_BEACON_NETWORK,
  DEFAULT_BEACON_RPC_URLS,
  type FetchConsensusProofOptions as BeaconFetchConsensusProofOptions,
  type BeaconNetworkConfig,
} from "./beacon-api";
import type { ConsensusProof } from "../types";
import {
  fetchExecutionConsensusProof,
  type FetchExecutionConsensusProofOptions,
} from "./execution-api";

export {
  BEACON_NETWORKS,
  CHAIN_ID_TO_BEACON_NETWORK,
  DEFAULT_BEACON_RPC_URLS,
  type BeaconNetworkConfig,
};

export interface FetchConsensusProofOptions
  extends BeaconFetchConsensusProofOptions,
    FetchExecutionConsensusProofOptions {
  /**
   * Rollout gate for experimental OP Stack consensus envelopes.
   * Default is false until verifier/runtime hardening is complete.
   */
  enableExperimentalOpstackConsensus?: boolean;
  /**
   * Rollout gate for experimental Linea consensus envelopes.
   * Default is false until the full verifier path is complete.
   */
  enableExperimentalLineaConsensus?: boolean;
}

export const UNSUPPORTED_CONSENSUS_MODE_ERROR_CODE =
  "unsupported-consensus-mode" as const;

export class UnsupportedConsensusModeError extends Error {
  readonly code = UNSUPPORTED_CONSENSUS_MODE_ERROR_CODE;

  constructor(
    readonly chainId: number,
    readonly consensusMode: "opstack" | "linea",
    readonly reason: "not-implemented" | "disabled-by-feature-flag" = "not-implemented"
  ) {
    super(
      reason === "disabled-by-feature-flag"
        ? `Consensus mode '${consensusMode}' is disabled by feature flag for chain ID ${chainId}.`
        : `Consensus mode '${consensusMode}' is not implemented for chain ID ${chainId}.`
    );
    this.name = "UnsupportedConsensusModeError";
  }
}

/**
 * Fetch a consensus proof for a chain using explicit mode routing.
 * Beacon uses light-client proofs; opstack/linea return execution-header
 * proof envelopes for packaging. Desktop verification runs deterministic
 * envelope checks for those modes and emits explicit pending-verifier codes.
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

  if (
    capability.consensusMode === "opstack" &&
    options.enableExperimentalOpstackConsensus !== true
  ) {
    throw new UnsupportedConsensusModeError(
      chainId,
      capability.consensusMode,
      "disabled-by-feature-flag"
    );
  }

  if (
    capability.consensusMode === "linea" &&
    options.enableExperimentalLineaConsensus !== true
  ) {
    throw new UnsupportedConsensusModeError(
      chainId,
      capability.consensusMode,
      "disabled-by-feature-flag"
    );
  }

  return fetchExecutionConsensusProof(chainId, capability.consensusMode, options);
}
