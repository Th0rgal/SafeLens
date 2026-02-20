import { decodeSimulationEvents } from "@safelens/core";
import type { EvidencePackage, SimulationVerificationResult } from "@safelens/core";

export type SimulationDetailRow = {
  id: string;
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

  const decodedEvents = decodeSimulationEvents(
    evidence.simulation.logs ?? [],
    evidence.safeAddress,
    evidence.chainId
  );
  const transfersOut = decodedEvents.filter(
    (event) => event.kind === "transfer" && event.direction === "send"
  ).length;
  const transfersIn = decodedEvents.filter(
    (event) => event.kind === "transfer" && event.direction === "receive"
  ).length;
  const approvals = decodedEvents.filter((event) => event.kind === "approval");

  if (decodedEvents.length > 0) {
    rows.push({
      id: "simulation-events-detected",
      label: "Token events",
      value: `${decodedEvents.length}`,
    });
  }

  if (transfersOut > 0 || transfersIn > 0) {
    rows.push({
      id: "simulation-transfers",
      label: "Token transfers",
      value: `${transfersOut} out, ${transfersIn} in`,
    });
  }

  const transfers = decodedEvents.filter((event) => event.kind === "transfer");
  transfers.slice(0, 5).forEach((event, index) => {
    const directionLabel =
      event.direction === "send"
        ? "Sent"
        : event.direction === "receive"
          ? "Received"
          : "Transfer";
    const counterparty =
      event.direction === "send"
        ? event.to
        : event.direction === "receive"
          ? event.from
          : event.to;
    const targetLabel =
      event.direction === "send"
        ? "to"
        : event.direction === "receive"
          ? "from"
          : "at";
    const tokenLabel = event.tokenSymbol ? "" : ` (${compactAddress(event.token)})`;
    rows.push({
      id: `simulation-transfer-${index + 1}`,
      label: `${directionLabel} ${index + 1}`,
      value: `${event.amountFormatted}${tokenLabel} ${targetLabel} ${compactAddress(counterparty)}`,
    });
  });

  if (approvals.length > 0) {
    const unlimitedApprovals = approvals.filter((event) =>
      event.amountFormatted.toLowerCase().includes("unlimited")
    ).length;
    rows.push({
      id: "simulation-approvals",
      label: "Token approvals",
      value:
        unlimitedApprovals > 0
          ? `${approvals.length} (${unlimitedApprovals} unlimited)`
          : `${approvals.length}`,
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
