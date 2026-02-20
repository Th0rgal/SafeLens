import { getNetworkCapability, type EvidencePackage } from "@safelens/core";

const SIMULATION_REASON_LABELS = {
  "missing-rpc-url":
    "Simulation was skipped because no RPC URL was configured during package generation.",
  "simulation-fetch-failed":
    "Simulation could not be fetched during package generation.",
  "missing-simulation": "No simulation result was included in this package.",
} as const;

export type SimulationUnavailableReasonCode = keyof typeof SIMULATION_REASON_LABELS;

const SIMULATION_REASON_CODES: SimulationUnavailableReasonCode[] = [
  "missing-rpc-url",
  "simulation-fetch-failed",
  "missing-simulation",
];

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
    return SIMULATION_REASON_LABELS[reasonCode];
  }

  const capability = getNetworkCapability(evidence.chainId);
  if (capability && !capability.supportsSimulation) {
    return "Simulation is not available for this network in SafeLens yet.";
  }

  return "No simulation result is available in this evidence package.";
}
