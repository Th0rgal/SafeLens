import { describe, expect, it } from "bun:test";
import type { ConsensusVerificationResult, EvidencePackage } from "@safelens/core";
import {
  buildFullyVerifiedDescription,
  buildFullyVerifiedPopoverDetail,
} from "../src/lib/verification-copy";

function makeConsensusVerification(
  overrides: Partial<ConsensusVerificationResult>
): ConsensusVerificationResult {
  return {
    valid: true,
    verified_state_root: "0x1",
    verified_block_number: 123,
    state_root_matches: true,
    sync_committee_participants: 512,
    error: null,
    error_code: null,
    checks: [],
    ...overrides,
  };
}

describe("buildFullyVerifiedDescription", () => {
  it("prefers finalized consensus block context over simulation block context", () => {
    const evidence = {
      consensusProof: { consensusMode: "beacon" },
      simulation: { blockNumber: 999, blockTimestamp: "2026-02-23T08:00:00Z" },
    } as EvidencePackage;

    const description = buildFullyVerifiedDescription(
      evidence,
      makeConsensusVerification({ verified_block_number: 456 })
    );

    expect(description).toBe("Verified against finalized chain state at block 456.");
  });

  it("uses mode-aware wording for OP Stack and Linea consensus", () => {
    const opstackDescription = buildFullyVerifiedDescription(
      { consensusProof: { consensusMode: "opstack" } } as EvidencePackage,
      makeConsensusVerification({ verified_block_number: 100 })
    );
    const lineaDescription = buildFullyVerifiedDescription(
      { consensusProof: { consensusMode: "linea" } } as EvidencePackage,
      makeConsensusVerification({ verified_block_number: 200 })
    );

    expect(opstackDescription).toBe("Verified against OP Stack consensus data at block 100.");
    expect(lineaDescription).toBe("Verified against Linea consensus data at block 200.");
  });
});

describe("buildFullyVerifiedPopoverDetail", () => {
  it("uses beacon-specific wording for beacon mode", () => {
    const detail = buildFullyVerifiedPopoverDetail(
      { consensusProof: { consensusMode: "beacon" } } as EvidencePackage
    );
    expect(detail).toContain("embedded Helios light client");
    expect(detail).toContain("finalized Beacon-chain verification");
  });

  it("uses non-beacon wording for OP Stack and Linea", () => {
    const opstackDetail = buildFullyVerifiedPopoverDetail(
      { consensusProof: { consensusMode: "opstack" } } as EvidencePackage
    );
    const lineaDetail = buildFullyVerifiedPopoverDetail(
      { consensusProof: { consensusMode: "linea" } } as EvidencePackage
    );

    expect(opstackDetail).toContain("OP Stack consensus verification");
    expect(opstackDetail).toContain("not equivalent to Beacon finality");
    expect(lineaDetail).toContain("Linea consensus verification");
    expect(lineaDetail).toContain("not equivalent to Beacon finality");
  });
});
