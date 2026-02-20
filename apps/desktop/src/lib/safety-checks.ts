import type { ConsensusVerificationResult, EvidencePackage } from "@safelens/core";

export type SafetyStatus = "check" | "warning" | "error";

export type SafetyCheck = {
  id: string;
  label: string;
  status: SafetyStatus;
  detail: string;
};

const WARNING_CONSENSUS_ERROR_CODES = new Set([
  "unsupported-consensus-mode",
  "unsupported-network",
  "opstack-consensus-verifier-pending",
  "linea-consensus-verifier-pending",
  "stale-consensus-envelope",
  "non-finalized-consensus-envelope",
]);

function getConsensusSuccessDetail(
  consensusMode: string | undefined,
  verifiedBlockNumber: number | null
): string {
  if (consensusMode === "opstack") {
    return verifiedBlockNumber != null
      ? `State root verified against OP Stack consensus data at block ${verifiedBlockNumber}. Assurance is chain-specific and not equivalent to Beacon finality.`
      : "State root verified against OP Stack consensus data. Assurance is chain-specific and not equivalent to Beacon finality.";
  }

  if (consensusMode === "linea") {
    return verifiedBlockNumber != null
      ? `State root verified against Linea consensus data at block ${verifiedBlockNumber}. Assurance is chain-specific and not equivalent to Beacon finality.`
      : "State root verified against Linea consensus data. Assurance is chain-specific and not equivalent to Beacon finality.";
  }

  return verifiedBlockNumber != null
    ? `Verified at block ${verifiedBlockNumber}.`
    : "Consensus verification passed.";
}

export function classifyConsensusStatus(
  evidence: EvidencePackage,
  consensusVerification: ConsensusVerificationResult | undefined,
  fallbackSummary: string
): SafetyCheck {
  if (!evidence.consensusProof) {
    return {
      id: "chain-state-finalized",
      label: "Chain state is finalized",
      status: "warning",
      detail: "No consensus proof was included in this evidence package.",
    };
  }

  if (!consensusVerification) {
    return {
      id: "chain-state-finalized",
      label: "Chain state is finalized",
      status: "warning",
      detail: "Consensus verification is still running.",
    };
  }

  if (consensusVerification.valid) {
    return {
      id: "chain-state-finalized",
      label: "Chain state is finalized",
      status: "check",
      detail: getConsensusSuccessDetail(
        evidence.consensusProof.consensusMode,
        consensusVerification.verified_block_number
      ),
    };
  }

  return {
    id: "chain-state-finalized",
    label: "Chain state is finalized",
    status: WARNING_CONSENSUS_ERROR_CODES.has(consensusVerification.error_code ?? "")
      ? "warning"
      : "error",
    detail: consensusVerification.error ?? fallbackSummary,
  };
}
