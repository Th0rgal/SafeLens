import { getNetworkCapability } from "@safelens/core";
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

function getConsensusSupportReasonText(
  exportReasons: ExportContractReason[]
): string | null {
  if (exportReasons.includes("consensus-mode-disabled-by-feature-flag")) {
    return "Partially supported: consensus verification mode is disabled by rollout feature flag in this build.";
  }

  if (exportReasons.includes("unsupported-consensus-mode")) {
    return "Partially supported: this network's consensus verification mode is not implemented yet.";
  }

  if (
    exportReasons.includes("opstack-consensus-verifier-pending") ||
    exportReasons.includes("linea-consensus-verifier-pending")
  ) {
    return "Partially supported: consensus envelope checks are available, but full cryptographic consensus verification is still pending.";
  }

  return null;
}

export function buildNetworkSupportStatus(
  evidence: Pick<
    EvidencePackage,
    "chainId" | "consensusProof" | "simulation" | "exportContract"
  >
): NetworkSupportStatus {
  const capability = getNetworkCapability(evidence.chainId);
  if (!capability) {
    return partial(
      "Partially supported: this network is unknown to SafeLens capabilities."
    );
  }

  const hasConsensusMode = Boolean(capability.consensusMode);
  const hasFullConsensusVerification = Boolean(capability.consensus);
  const supportsSimulation = capability.supportsSimulation;
  const hasConsensusProof = Boolean(evidence.consensusProof);
  const hasSimulation = Boolean(evidence.simulation);
  const exportReasons = evidence.exportContract?.reasons ?? [];
  const consensusSupportReasonText = getConsensusSupportReasonText(exportReasons);

  if (!supportsSimulation && !hasConsensusMode) {
    return partial(
      "Partially supported: consensus verification and full simulation are not available on this network."
    );
  }

  if (!supportsSimulation && hasConsensusMode && !hasFullConsensusVerification) {
    return partial(
      "Partially supported: simulation is unavailable, and only consensus envelope checks are available (full cryptographic consensus verification is pending)."
    );
  }

  if (!supportsSimulation) {
    return partial(
      "Partially supported: full simulation is not available on this network."
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

  if (!hasFullConsensusVerification && hasConsensusMode) {
    return partial(
      "Partially supported: consensus envelope checks are available, but full cryptographic consensus verification is not available on this network yet."
    );
  }

  if (hasFullConsensusVerification) {
    return {
      isFullySupported: true,
      badgeText: "Full",
      helperText: null,
    };
  }

  return partial(
    "Partially supported: consensus verification is not available on this network."
  );
}
