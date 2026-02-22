import {
  type ExportContractReason,
  EXPORT_CONTRACT_REASON_LABELS,
  getNetworkCapability,
  type EvidencePackage,
} from "@safelens/core";

const SIMULATION_REASON_CODES: ExportContractReason[] = [
  "missing-rpc-url",
  "simulation-fetch-failed",
  "missing-simulation",
];

export type SimulationUnavailableReasonCode = ExportContractReason;

export function getSimulationUnavailableReasonCode(
  evidence: Pick<EvidencePackage, "exportContract">
): SimulationUnavailableReasonCode | null {
  const exportReasons = evidence.exportContract?.reasons ?? [];
  const matchedReason = SIMULATION_REASON_CODES.find((code) =>
    exportReasons.includes(code)
  );
  return matchedReason ?? null;
}

export function getSimulationUnavailableReason(
  evidence: Pick<EvidencePackage, "chainId" | "exportContract">
): string {
  const reasonCode = getSimulationUnavailableReasonCode(evidence);
  if (reasonCode) {
    return EXPORT_CONTRACT_REASON_LABELS[reasonCode];
  }

  const capability = getNetworkCapability(evidence.chainId);
  if (capability && !capability.supportsSimulation) {
    return "Simulation is not available for this network in SafeLens yet.";
  }

  return "No simulation result is available in this evidence package.";
}
