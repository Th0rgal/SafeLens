import type { ConsensusVerificationResult, EvidencePackage } from "@safelens/core";

export type SafetyStatus = "check" | "warning" | "error";

export type SafetyCheck = {
  id: string;
  label: string;
  status: SafetyStatus;
  detail: string;
  reasonCode?: string;
};

const WARNING_CONSENSUS_ERROR_CODES = new Set([
  "consensus-mode-disabled-by-feature-flag",
  "unsupported-consensus-mode",
  "unsupported-network",
  "opstack-consensus-verifier-pending",
  "linea-consensus-verifier-pending",
  "stale-consensus-envelope",
  "non-finalized-consensus-envelope",
]);

const CONSENSUS_ERROR_DETAILS: Partial<Record<string, string>> = {
  "consensus-mode-disabled-by-feature-flag":
    "Consensus verification for this mode is disabled in this build.",
  "unsupported-consensus-mode":
    "This package uses a consensus mode the desktop verifier does not support.",
  "unsupported-network":
    "Consensus verification is not available for this network/mode combination.",
  "opstack-consensus-verifier-pending":
    "OP Stack envelope integrity checks passed, but full cryptographic consensus verification is not available yet.",
  "linea-consensus-verifier-pending":
    "Linea envelope integrity checks passed, but full cryptographic consensus verification is not available yet.",
  "stale-consensus-envelope":
    "Consensus envelope is stale versus package creation time. Regenerate evidence with fresher consensus data.",
  "non-finalized-consensus-envelope":
    "Consensus envelope is not finalized. Regenerate evidence at a finalized block.",
  "state-root-mismatch":
    "Consensus-verified state root does not match the package state root.",
  "invalid-proof-payload":
    "Consensus proof payload is invalid or malformed.",
  "invalid-expected-state-root":
    "Expected state root format is invalid.",
};

function getConsensusFailureDetail(
  consensusVerification: ConsensusVerificationResult,
  fallbackSummary: string
): string {
  const mapped = consensusVerification.error_code
    ? CONSENSUS_ERROR_DETAILS[consensusVerification.error_code]
    : undefined;
  if (mapped) {
    return mapped;
  }

  return consensusVerification.error ?? fallbackSummary;
}

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
      detail:
        fallbackSummary.trim().length > 0
          ? fallbackSummary
          : "No consensus proof was included in this evidence package.",
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
    detail: getConsensusFailureDetail(consensusVerification, fallbackSummary),
    reasonCode: consensusVerification.error_code ?? undefined,
  };
}
