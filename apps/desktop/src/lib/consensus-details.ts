import type {
  ConsensusMode,
  ConsensusVerificationResult,
  EvidencePackage,
} from "@safelens/core";

export const CONSENSUS_DETAIL_ROW_IDS = [
  "consensus-mode",
  "consensus-assurance",
  "consensus-status",
  "consensus-finalized-block",
  "consensus-participants",
  "consensus-state-root",
] as const;

export type ConsensusDetailRowId = (typeof CONSENSUS_DETAIL_ROW_IDS)[number];

export type ConsensusDetailRow = {
  id: ConsensusDetailRowId;
  label: string;
  value: string;
  monospace?: boolean;
};

const CONSENSUS_MODE_METADATA = {
  beacon: {
    label: "Beacon",
    assuranceNotice: null,
  },
  opstack: {
    label: "OP Stack",
    assuranceNotice:
      "OP Stack consensus checks are not equivalent to Beacon light-client finality.",
  },
  linea: {
    label: "Linea",
    assuranceNotice:
      "Linea consensus checks are not equivalent to Beacon light-client finality.",
  },
} as const satisfies Record<
  ConsensusMode,
  {
    label: string;
    assuranceNotice: string | null;
  }
>;

function getConsensusModeMetadata(mode: ConsensusMode) {
  return CONSENSUS_MODE_METADATA[mode];
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
  const { label: consensusModeLabel, assuranceNotice } =
    getConsensusModeMetadata(consensusMode);
  const rows: ConsensusDetailRow[] = [
    {
      id: "consensus-mode",
      label: "Consensus mode",
      value: consensusModeLabel,
    },
  ];
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
