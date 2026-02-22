import { getNetworkCapability, type ConsensusVerifierMode } from "@safelens/core";

export interface ConsensusEnrichmentPlan {
  consensusMode: ConsensusVerifierMode | null;
  shouldAttemptConsensusProof: boolean;
}

export function buildConsensusEnrichmentPlan(
  chainId: number
): ConsensusEnrichmentPlan {
  const consensusMode = getNetworkCapability(chainId)?.consensusMode ?? null;
  return {
    consensusMode,
    shouldAttemptConsensusProof: consensusMode !== null,
  };
}
