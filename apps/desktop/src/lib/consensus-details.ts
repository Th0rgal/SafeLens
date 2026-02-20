import type { ConsensusVerificationResult, EvidencePackage } from "@safelens/core";

export type ConsensusDetailRow = {
  id: string;
  label: string;
  value: string;
  monospace?: boolean;
};

function getConsensusModeLabel(mode: string | undefined): string {
  switch (mode) {
    case "opstack":
      return "OP Stack";
    case "linea":
      return "Linea";
    default:
      return "Beacon";
  }
}

export function buildConsensusDetailRows(
  evidence: Pick<EvidencePackage, "consensusProof">,
  consensusVerification: ConsensusVerificationResult | undefined
): ConsensusDetailRow[] {
  if (!evidence.consensusProof) {
    return [];
  }

  const rows: ConsensusDetailRow[] = [
    {
      id: "consensus-mode",
      label: "Consensus mode",
      value: getConsensusModeLabel(evidence.consensusProof.consensusMode),
    },
  ];

  if (!consensusVerification) {
    rows.push({
      id: "consensus-status",
      label: "Verification status",
      value: "Running",
    });
    return rows;
  }

  if (consensusVerification.verified_block_number != null) {
    rows.push({
      id: "consensus-finalized-block",
      label: "Finalized block",
      value: String(consensusVerification.verified_block_number),
    });
  }

  if (
    evidence.consensusProof.consensusMode === "beacon" &&
    consensusVerification.sync_committee_participants > 0
  ) {
    rows.push({
      id: "consensus-participants",
      label: "Participants",
      value: `${consensusVerification.sync_committee_participants}/512`,
    });
  }

  if (consensusVerification.verified_state_root) {
    rows.push({
      id: "consensus-state-root",
      label: "Verified state root",
      value: consensusVerification.verified_state_root,
      monospace: true,
    });
  }

  return rows;
}
