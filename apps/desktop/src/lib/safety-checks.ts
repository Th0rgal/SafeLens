import {
  type ConsensusMode,
  findLegacyPendingConsensusExportReason,
  isConsensusVerifierErrorCode,
  isWarningConsensusTrustDecisionReason,
  mapConsensusVerifierErrorCodeToTrustReason,
  type ConsensusVerificationResult,
  type ConsensusVerifierErrorCode,
  type EvidencePackage,
  type PolicyProofVerificationResult,
  type SimulationVerificationResult,
} from "@safelens/core";
import {
  getSimulationUnavailableReason,
  getSimulationUnavailableReasonCode,
} from "./simulation-unavailable";

export type SafetyStatus = "check" | "warning" | "error";
export type SafetyCheckId =
  | "policy-authentic"
  | "chain-state-finalized"
  | "simulation-outcome";

export type SafetyCheck = {
  id: SafetyCheckId;
  label: string;
  status: SafetyStatus;
  detail: string;
  reasonCode?: string;
};

export type SafetyAttentionItem = {
  id: string;
  detail: string;
  reasonCode?: string;
};

type ConsensusFailureDetailCode =
  | ConsensusVerifierErrorCode
  | "consensus-mode-disabled-by-feature-flag";

const CONSENSUS_ERROR_DETAILS: Partial<
  Record<ConsensusFailureDetailCode, string>
> = {
  "consensus-mode-disabled-by-feature-flag":
    "Consensus verification for this mode is disabled in this build.",
  "unsupported-consensus-mode":
    "This package uses a consensus mode the desktop verifier does not support.",
  "unsupported-network":
    "Consensus verification is not available for this network/mode combination.",
  "envelope-network-mismatch":
    "Package network metadata does not match the consensus envelope chain metadata.",
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
  "envelope-state-root-mismatch":
    "Consensus envelope state root does not match the package consensus proof.",
  "envelope-block-number-mismatch":
    "Consensus envelope block number does not match the package consensus proof.",
  "invalid-proof-payload":
    "Consensus proof payload is invalid or malformed.",
  "invalid-expected-state-root":
    "Expected state root format is invalid.",
};

const NO_PROOF_CONSENSUS_REASON_CODES = [
  "consensus-mode-disabled-by-feature-flag",
  "unsupported-consensus-mode",
  "consensus-proof-fetch-failed",
  "missing-consensus-proof",
] as const;

type NoProofConsensusReasonCode = (typeof NO_PROOF_CONSENSUS_REASON_CODES)[number];

const NO_PROOF_CONSENSUS_DETAILS: Record<NoProofConsensusReasonCode, string> = {
  "consensus-mode-disabled-by-feature-flag":
    "Consensus verification for this mode is disabled in this build.",
  "unsupported-consensus-mode":
    "This network/mode is not supported for consensus verification in this build.",
  "consensus-proof-fetch-failed":
    "Consensus proof generation failed during package creation. Regenerate the package and retry.",
  "missing-consensus-proof":
    "No consensus proof was included in this evidence package.",
};

function getNoProofConsensusReasonCode(
  evidence: Pick<EvidencePackage, "exportContract">
): NoProofConsensusReasonCode | null {
  const exportReasons = evidence.exportContract?.reasons ?? [];
  const matched = NO_PROOF_CONSENSUS_REASON_CODES.find((reasonCode) =>
    exportReasons.includes(reasonCode)
  );
  return matched ?? null;
}

function getLegacyPendingConsensusReasonCode(
  evidence: Pick<EvidencePackage, "exportContract">
): ReturnType<typeof findLegacyPendingConsensusExportReason> {
  return findLegacyPendingConsensusExportReason(evidence.exportContract?.reasons);
}

function getConsensusFailureDetail(
  consensusVerification: ConsensusVerificationResult,
  fallbackSummary: string
): string {
  const mapped = (() => {
    const errorCode = consensusVerification.error_code;
    if (!errorCode) {
      return undefined;
    }
    if (isConsensusVerifierErrorCode(errorCode)) {
      return CONSENSUS_ERROR_DETAILS[errorCode];
    }
    if (errorCode === "consensus-mode-disabled-by-feature-flag") {
      return CONSENSUS_ERROR_DETAILS["consensus-mode-disabled-by-feature-flag"];
    }
    return undefined;
  })();
  if (mapped) {
    return mapped;
  }

  return consensusVerification.error ?? fallbackSummary;
}

function getConsensusFailureStatus(
  consensusVerification: ConsensusVerificationResult
): SafetyStatus {
  const reason = mapConsensusVerifierErrorCodeToTrustReason(
    consensusVerification.error_code
  );
  return isWarningConsensusTrustDecisionReason(reason) ? "warning" : "error";
}

function getConsensusSuccessDetail(
  consensusMode: ConsensusMode | undefined,
  verifiedBlockNumber: number | null
): string {
  switch (consensusMode) {
    case "opstack":
      return verifiedBlockNumber != null
        ? `State root verified against OP Stack consensus data at block ${verifiedBlockNumber}. Assurance is chain-specific and not equivalent to Beacon finality.`
        : "State root verified against OP Stack consensus data. Assurance is chain-specific and not equivalent to Beacon finality.";
    case "linea":
      return verifiedBlockNumber != null
        ? `State root verified against Linea consensus data at block ${verifiedBlockNumber}. Assurance is chain-specific and not equivalent to Beacon finality.`
        : "State root verified against Linea consensus data. Assurance is chain-specific and not equivalent to Beacon finality.";
    case "beacon":
    case undefined:
      return verifiedBlockNumber != null
        ? `Verified at block ${verifiedBlockNumber}.`
        : "Consensus verification passed.";
    default:
      return assertUnreachableConsensusMode(consensusMode);
  }
}

function assertUnreachableConsensusMode(mode: never): never {
  throw new Error(`Unhandled consensus mode: ${String(mode)}`);
}

export function classifyPolicyStatus(
  evidence: EvidencePackage,
  policyProof: PolicyProofVerificationResult | undefined
): SafetyCheck {
  const exportReasons = evidence.exportContract?.reasons ?? [];

  if (!evidence.onchainPolicyProof) {
    return {
      id: "policy-authentic",
      label: "Policy is authentic",
      status: "warning",
      detail: "No on-chain policy proof was included in this evidence package.",
      reasonCode: exportReasons.includes("missing-onchain-policy-proof")
        ? "missing-onchain-policy-proof"
        : undefined,
    };
  }

  if (!policyProof) {
    return {
      id: "policy-authentic",
      label: "Policy is authentic",
      status: "warning",
      detail: "Policy proof verification is still running.",
    };
  }

  if (policyProof.valid) {
    return {
      id: "policy-authentic",
      label: "Policy is authentic",
      status: "check",
      detail: "All policy fields matched the on-chain proof.",
    };
  }

  return {
    id: "policy-authentic",
    label: "Policy is authentic",
    status: "error",
    detail: policyProof.errors[0] ?? "Policy proof verification failed.",
    reasonCode: "policy-proof-verification-failed",
  };
}

export function classifyConsensusStatus(
  evidence: EvidencePackage,
  consensusVerification: ConsensusVerificationResult | undefined,
  fallbackSummary: string
): SafetyCheck {
  if (!evidence.consensusProof) {
    const reasonCode = getNoProofConsensusReasonCode(evidence);
    return {
      id: "chain-state-finalized",
      label: "Chain state is finalized",
      status: "warning",
      detail: reasonCode
        ? NO_PROOF_CONSENSUS_DETAILS[reasonCode]
        : fallbackSummary.trim().length > 0
          ? fallbackSummary
          : "No consensus proof was included in this evidence package.",
      reasonCode: reasonCode ?? undefined,
    };
  }

  if (!consensusVerification) {
    const reasonCode = getLegacyPendingConsensusReasonCode(evidence);
    return {
      id: "chain-state-finalized",
      label: "Chain state is finalized",
      status: "warning",
      detail: reasonCode
        ? "This package was exported with a legacy pending-verifier reason. Re-export with a current SafeLens build."
        : "Consensus verification result is unavailable in this session. Retry verification in the desktop app.",
      reasonCode: reasonCode ?? undefined,
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
    status: getConsensusFailureStatus(consensusVerification),
    detail: getConsensusFailureDetail(consensusVerification, fallbackSummary),
    reasonCode: consensusVerification.error_code ?? undefined,
  };
}

export function classifySimulationStatus(
  evidence: EvidencePackage,
  simulationVerification: SimulationVerificationResult | undefined
): SafetyCheck {
  if (!simulationVerification || !evidence.simulation) {
    const reasonCode = getSimulationUnavailableReasonCode(evidence);
    return {
      id: "simulation-outcome",
      label: "Simulation outcome",
      status: "warning",
      detail: getSimulationUnavailableReason(evidence),
      reasonCode: reasonCode ?? undefined,
    };
  }

  if (!simulationVerification.valid) {
    return {
      id: "simulation-outcome",
      label: "Simulation outcome",
      status: "error",
      detail:
        simulationVerification.errors[0] ??
        "Simulation structure checks failed.",
      reasonCode: "simulation-verification-failed",
    };
  }

  if (simulationVerification.executionReverted) {
    return {
      id: "simulation-outcome",
      label: "Simulation outcome",
      status: "warning",
      detail: "Simulation ran but the transaction reverted.",
      reasonCode: "simulation-execution-reverted",
    };
  }

  return {
    id: "simulation-outcome",
    label: "Simulation outcome",
    status: "check",
    detail: "Simulation ran successfully.",
  };
}

type SafetyAttentionSupportStatus = {
  isFullySupported: boolean;
  helperText: string | null;
};

export function buildSafetyAttentionItems(
  checks: SafetyCheck[],
  supportStatus: SafetyAttentionSupportStatus | null,
  maxItems = 3
): SafetyAttentionItem[] {
  const sortedChecks = [...checks].sort((left, right) => {
    const leftRank = left.status === "error" ? 0 : left.status === "warning" ? 1 : 2;
    const rightRank = right.status === "error" ? 0 : right.status === "warning" ? 1 : 2;
    return leftRank - rightRank;
  });

  const items: Array<SafetyAttentionItem & { dedupeKey: string }> = sortedChecks
    .filter((check) => check.status !== "check")
    .map((check) => ({
      id: `check-${check.id}`,
      detail: `${check.label}: ${check.detail}`,
      reasonCode: check.reasonCode,
      dedupeKey: check.detail.trim().toLowerCase(),
    }));

  if (supportStatus && !supportStatus.isFullySupported && supportStatus.helperText) {
    items.push({
      id: "network-support",
      detail: supportStatus.helperText,
      dedupeKey: supportStatus.helperText.trim().toLowerCase(),
    });
  }

  const deduped = items.filter((item, index, all) => {
    return (
      all.findIndex((candidate) => candidate.dedupeKey === item.dedupeKey) ===
      index
    );
  });

  return deduped.slice(0, Math.max(maxItems, 0)).map(({ dedupeKey: _dedupeKey, ...item }) => item);
}
