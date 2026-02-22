import { describe, expect, it } from "vitest";
import type { ConsensusProof } from "@safelens/core";
import { summarizeConsensusProof } from "./consensus-proof-summary";

describe("summarizeConsensusProof", () => {
  it("summarizes beacon proofs with update count", () => {
    const proof: ConsensusProof = {
      stateRoot: "0x1234567890123456789012345678901234567890123456789012345678901234",
      blockNumber: 21000000,
      checkpoint: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      bootstrap: "{}",
      updates: ["{}", "{}"],
      finalityUpdate: "{}",
      network: "mainnet",
      finalizedSlot: 123456,
    };

    expect(summarizeConsensusProof(proof)).toEqual({
      toneClassName: "text-green-400",
      text: "Included (mainnet, block 21000000, 2 sync committee updates)",
    });
  });

  it("summarizes execution-envelope proofs as package envelope only", () => {
    const proof: ConsensusProof = {
      consensusMode: "opstack",
      stateRoot: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      blockNumber: 1200,
      network: "optimism",
      proofPayload: "{\"executionBlockNumber\":1200}",
    };

    expect(summarizeConsensusProof(proof)).toEqual({
      toneClassName: "text-orange-400",
      text: "Included (optimism, block 1200, mode opstack package envelope only)",
    });
  });
});
