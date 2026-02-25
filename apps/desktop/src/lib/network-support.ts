import {
  findLegacyPendingConsensusExportReason,
  getNetworkCapability,
} from "@safelens/core";
import type { EvidencePackage, ExportContractReason } from "@safelens/core";

export type NetworkSupportStatus = {
  isFullySupported: boolean;
  badgeText: "Full" | "Partial";
  helperText: string | null;
};

function partial(helperText: string): NetworkSupportStatus {
  return {
    isFullySupported: false,
    badgeText: "Partial",
    helperText,
  };
}

const CONSENSUS_SUPPORT_REASON_PRIORITY = [
  "consensus-mode-disabled-by-feature-flag",
  "unsupported-consensus-mode",
] as const satisfies readonly ExportContractReason[];

type ConsensusSupportReasonCode =
  (typeof CONSENSUS_SUPPORT_REASON_PRIORITY)[number];

const CONSENSUS_SUPPORT_REASON_TEXT_BY_CODE: Record<
  ConsensusSupportReasonCode,
  string
> = {
  "consensus-mode-disabled-by-feature-flag":
    "Partially supported: consensus verification mode is disabled by rollout feature flag in this build.",
  "unsupported-consensus-mode":
    "Partially supported: this network's consensus verification mode is not supported in this build.",
};

function getConsensusSupportReasonText(
  exportReasons: readonly ExportContractReason[]
): string | null {
  for (const reasonCode of CONSENSUS_SUPPORT_REASON_PRIORITY) {
    if (exportReasons.includes(reasonCode)) {
      return CONSENSUS_SUPPORT_REASON_TEXT_BY_CODE[reasonCode];
    }
  }

  if (findLegacyPendingConsensusExportReason(exportReasons)) {
    return "Partially supported: this package was exported with a legacy pending-verifier reason. Re-export with a current SafeLens build.";
  }

  return null;
}

export function buildNetworkSupportStatus(
  evidence: Pick<
    EvidencePackage,
    "chainId" | "consensusProof" | "onchainPolicyProof" | "simulation" | "exportContract"
  >
): NetworkSupportStatus {
  const capability = getNetworkCapability(evidence.chainId);
  if (!capability) {
    return partial(
      "Partially supported: this network is unknown to SafeLens capabilities."
    );
  }

  const hasConsensusMode = Boolean(capability.consensusMode);
  const supportsSimulation = capability.supportsSimulation;
  const hasConsensusProof = Boolean(evidence.consensusProof);
  const hasOnchainPolicyProof = Boolean(evidence.onchainPolicyProof);
  const hasSimulation = Boolean(evidence.simulation);
  const exportReasons = evidence.exportContract?.reasons ?? [];
  const consensusSupportReasonText = getConsensusSupportReasonText(exportReasons);

  if (!supportsSimulation && !hasConsensusMode) {
    return partial(
      "Partially supported: consensus verification and full simulation are not available on this network."
    );
  }

  if (!supportsSimulation) {
    return partial(
      "Partially supported: full simulation is not available on this network."
    );
  }

  if (!hasConsensusMode) {
    return partial(
      "Partially supported: consensus verification is not available on this network."
    );
  }

  if (!hasSimulation) {
    return partial(
      "Partially supported for this package: simulation was not performed."
    );
  }

  if (consensusSupportReasonText) {
    return partial(consensusSupportReasonText);
  }

  if (!hasConsensusProof) {
    return partial(
      "Partially supported for this package: no consensus proof was included."
    );
  }

  // Policy proof is required for full verification -- without it, the
  // desktop verifier cannot confirm the on-chain Safe state independently.
  if (!hasOnchainPolicyProof) {
    return partial(
      "Partially supported for this package: on-chain policy proof was not included."
    );
  }

  return {
    isFullySupported: true,
    badgeText: "Full",
    helperText: null,
  };
}
