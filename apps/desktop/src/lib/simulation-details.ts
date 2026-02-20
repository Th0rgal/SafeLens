import { summarizeSimulationEvents } from "@safelens/core";
import type { EvidencePackage, SimulationVerificationResult } from "@safelens/core";

export const SIMULATION_DETAIL_FIXED_ROW_IDS = [
  "simulation-status",
  "simulation-unavailable-reason",
  "simulation-checks-passed",
  "simulation-events-detected",
  "simulation-transfers",
  "simulation-approvals",
  "simulation-first-error",
] as const;

type SimulationDetailFixedRowId =
  (typeof SIMULATION_DETAIL_FIXED_ROW_IDS)[number];
export type SimulationDetailRowId =
  | SimulationDetailFixedRowId
  | `simulation-transfer-${number}`;

export type SimulationDetailRow = {
  id: SimulationDetailRowId;
  label: string;
  value: string;
};

type SimulationEvidence = Pick<EvidencePackage, "chainId" | "safeAddress" | "simulation">;

function compactAddress(address: string): string {
  if (!address.startsWith("0x") || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function buildSimulationDetailRows(
  evidence: SimulationEvidence,
  simulationVerification: SimulationVerificationResult | undefined,
  unavailableReason: string
): SimulationDetailRow[] {
  if (!simulationVerification || !evidence.simulation) {
    return [
      { id: "simulation-status", label: "Simulation status", value: "Unavailable" },
      { id: "simulation-unavailable-reason", label: "Reason", value: unavailableReason },
    ];
  }

  const rows: SimulationDetailRow[] = [];
  const checksPassed = simulationVerification.checks.filter((check) => check.passed).length;
  const checksTotal = simulationVerification.checks.length;

  rows.push({
    id: "simulation-status",
    label: "Simulation status",
    value: simulationVerification.valid
      ? simulationVerification.executionReverted
        ? "Executed but reverted"
        : "Executed successfully"
      : "Verification failed",
  });
  rows.push({
    id: "simulation-checks-passed",
    label: "Simulation checks passed",
    value: `${checksPassed}/${checksTotal}`,
  });

  const summary = summarizeSimulationEvents(
    evidence.simulation.logs ?? [],
    evidence.safeAddress,
    evidence.chainId,
    { maxTransferPreviews: 5 }
  );

  if (summary.totalEvents > 0) {
    rows.push({
      id: "simulation-events-detected",
      label: "Token events",
      value: `${summary.totalEvents}`,
    });
  }

  if (summary.transfersOut > 0 || summary.transfersIn > 0) {
    rows.push({
      id: "simulation-transfers",
      label: "Token transfers",
      value: `${summary.transfersOut} out, ${summary.transfersIn} in`,
    });
  }

  summary.transferPreviews.forEach((event, index) => {
    const directionLabel =
      event.direction === "send"
        ? "Sent"
        : event.direction === "receive"
          ? "Received"
          : "Transfer";
    const targetLabel = event.counterpartyRole;
    const tokenLabel = event.tokenSymbol ? "" : ` (${compactAddress(event.token)})`;
    rows.push({
      id: `simulation-transfer-${index + 1}`,
      label: `${directionLabel} ${index + 1}`,
      value: `${event.amountFormatted}${tokenLabel} ${targetLabel} ${compactAddress(event.counterparty)}`,
    });
  });

  if (summary.approvals > 0) {
    rows.push({
      id: "simulation-approvals",
      label: "Token approvals",
      value:
        summary.unlimitedApprovals > 0
          ? `${summary.approvals} (${summary.unlimitedApprovals} unlimited)`
          : `${summary.approvals}`,
    });
  }

  if (simulationVerification.errors.length > 0) {
    rows.push({
      id: "simulation-first-error",
      label: "Verifier error",
      value: simulationVerification.errors[0]!,
    });
  }

  return rows;
}
