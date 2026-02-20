import type {
  ConsensusMode,
  ConsensusVerificationResult,
  EvidencePackage,
} from "@safelens/core";

export type ConsensusDetailRow = {
  id: string;
  label: string;
  value: string;
  monospace?: boolean;
};

function getConsensusModeLabel(mode: ConsensusMode): string {
  switch (mode) {
    case "opstack":
      return "OP Stack";
    case "linea":
      return "Linea";
    default:
      return "Beacon";
  }
}

function getAssuranceNotice(mode: ConsensusMode): string | null {
  switch (mode) {
    case "opstack":
      return "OP Stack consensus checks are not equivalent to Beacon light-client finality.";
    case "linea":
      return "Linea consensus checks are not equivalent to Beacon light-client finality.";
    default:
      return null;
  }
}

function isUnverifiedNonBeaconConsensus(
  evidence: Pick<EvidencePackage, "consensusProof">,
  consensusVerification: ConsensusVerificationResult
): boolean {
  const mode = evidence.consensusProof?.consensusMode ?? "beacon";
  return mode !== "beacon" && consensusVerification.valid !== true;
}

export function buildConsensusDetailRows(
  evidence: Pick<EvidencePackage, "consensusProof">,
  consensusVerification: ConsensusVerificationResult | undefined
): ConsensusDetailRow[] {
  if (!evidence.consensusProof) {
    return [];
  }

  const consensusMode = evidence.consensusProof.consensusMode ?? "beacon";
  const rows: ConsensusDetailRow[] = [
    {
      id: "consensus-mode",
      label: "Consensus mode",
      value: getConsensusModeLabel(consensusMode),
    },
  ];
  const assuranceNotice = getAssuranceNotice(consensusMode);
  if (assuranceNotice) {
    rows.push({
      id: "consensus-assurance",
      label: "Assurance",
      value: assuranceNotice,
    });
  }

  if (!consensusVerification) {
    rows.push({
      id: "consensus-status",
      label: "Verification status",
      value: "Unavailable in this session",
    });
    return rows;
  }

  const usesEnvelopeLabels = isUnverifiedNonBeaconConsensus(
    evidence,
    consensusVerification
  );

  if (consensusVerification.verified_block_number != null) {
    rows.push({
      id: "consensus-finalized-block",
      label: usesEnvelopeLabels ? "Envelope block" : "Finalized block",
      value: String(consensusVerification.verified_block_number),
    });
  }

  if (
    consensusMode === "beacon" &&
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
      label: usesEnvelopeLabels ? "Envelope state root" : "Verified state root",
      value: consensusVerification.verified_state_root,
      monospace: true,
    });
  }

  return rows;
}
