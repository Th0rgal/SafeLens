import type { ConsensusVerificationResult, EvidencePackage } from "@safelens/core";

function formatSimulationBlockContext(evidence: EvidencePackage): string | null {
  const simulation = evidence.simulation;
  if (!simulation) {
    return null;
  }

  const blockPart = `simulation block ${simulation.blockNumber}`;
  if (simulation.blockTimestamp) {
    return `${blockPart} (${simulation.blockTimestamp})`;
  }

  return blockPart;
}

export function buildFullyVerifiedDescription(
  evidence: EvidencePackage,
  consensusVerification: ConsensusVerificationResult | undefined
): string {
  const verifiedBlock = consensusVerification?.verified_block_number;
  const mode = evidence.consensusProof?.consensusMode;

  if (verifiedBlock != null) {
    if (mode === "opstack") {
      return `Verified against OP Stack consensus data at block ${verifiedBlock}.`;
    }
    if (mode === "linea") {
      return `Verified against Linea consensus data at block ${verifiedBlock}.`;
    }
    return `Verified against finalized chain state at block ${verifiedBlock}.`;
  }

  const simulationContext = formatSimulationBlockContext(evidence);
  return simulationContext
    ? `Verification checks passed. Using ${simulationContext}.`
    : "Verification checks passed.";
}

export function buildFullyVerifiedPopoverDetail(evidence: EvidencePackage): string {
  const mode = evidence.consensusProof?.consensusMode;
  const witnessOnlySimulation = evidence.simulationWitness?.witnessOnly === true;
  const simulationLine = witnessOnlySimulation
    ? "Simulation effects are derived from local replay logs."
    : "Simulation effects come from the packaged simulation and are structurally verified.";

  if (mode === "opstack") {
    return `This evidence passed local integrity checks and OP Stack consensus verification. OP Stack assurance is chain-specific and not equivalent to Beacon finality. ${simulationLine}`;
  }

  if (mode === "linea") {
    return `This evidence passed local integrity checks and Linea consensus verification. Linea assurance is chain-specific and not equivalent to Beacon finality. ${simulationLine}`;
  }

  return `This evidence passed local integrity checks and finalized Beacon-chain verification using the embedded Helios light client. ${simulationLine}`;
}
