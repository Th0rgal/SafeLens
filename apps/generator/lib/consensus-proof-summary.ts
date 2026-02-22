import type { ConsensusProof } from "@safelens/core";

type ConsensusProofSummary = {
  toneClassName: "text-green-400" | "text-orange-400";
  text: string;
};

export function summarizeConsensusProof(proof: ConsensusProof): ConsensusProofSummary {
  if ("proofPayload" in proof) {
    return {
      toneClassName: "text-orange-400",
      text: `Included (${proof.network}, block ${proof.blockNumber}, mode ${proof.consensusMode} package envelope only)`,
    };
  }

  const updatesCount = proof.updates.length;
  return {
    toneClassName: "text-green-400",
    text: `Included (${proof.network}, block ${proof.blockNumber}, ${updatesCount} sync committee update${updatesCount !== 1 ? "s" : ""})`,
  };
}
