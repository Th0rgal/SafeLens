import { describe, expect, it } from "bun:test";
import type { ConsensusVerificationResult, EvidencePackage } from "@safelens/core";
import { classifyConsensusStatus } from "../src/lib/safety-checks";

function makeEvidence(consensusMode?: "beacon" | "opstack" | "linea"): EvidencePackage {
  if (!consensusMode) {
    return {} as EvidencePackage;
  }

  return {
    consensusProof: { consensusMode } as EvidencePackage["consensusProof"],
  } as EvidencePackage;
}

function makeConsensusVerification(
  overrides: Partial<ConsensusVerificationResult>
): ConsensusVerificationResult {
  return {
    valid: false,
    verified_state_root: null,
    verified_block_number: null,
    state_root_matches: false,
    sync_committee_participants: 0,
    error: "consensus verification failed",
    error_code: "state-root-mismatch",
    checks: [],
    ...overrides,
  };
}

describe("classifyConsensusStatus", () => {
  it("returns warning when no consensus proof is included", () => {
    const status = classifyConsensusStatus(makeEvidence(), undefined, "fallback summary");
    expect(status.status).toBe("warning");
    expect(status.detail).toBe("fallback summary");
  });

  it("falls back to default no-proof detail when summary is empty", () => {
    const status = classifyConsensusStatus(makeEvidence(), undefined, "");
    expect(status.status).toBe("warning");
    expect(status.detail).toContain("No consensus proof");
  });

  it("returns warning for partial-support consensus errors", () => {
    const status = classifyConsensusStatus(
      makeEvidence("opstack"),
      makeConsensusVerification({
        valid: false,
        error: "unsupported network for this consensus mode",
        error_code: "unsupported-network",
      }),
      "fallback summary"
    );
    expect(status.status).toBe("warning");
    expect(status.detail).toBe(
      "Consensus verification is not available for this network/mode combination."
    );
  });

  it("returns error for consensus mismatches", () => {
    const status = classifyConsensusStatus(
      makeEvidence("beacon"),
      makeConsensusVerification({
        valid: false,
        error: "state root mismatch",
        error_code: "state-root-mismatch",
      }),
      "fallback summary"
    );
    expect(status.status).toBe("error");
    expect(status.detail).toBe(
      "Consensus-verified state root does not match the package state root."
    );
  });

  it("falls back to verifier error text for unknown error codes", () => {
    const status = classifyConsensusStatus(
      makeEvidence("beacon"),
      makeConsensusVerification({
        valid: false,
        error: "unexpected verifier edge case",
        error_code: "some-new-error-code",
      }),
      "fallback summary"
    );
    expect(status.status).toBe("error");
    expect(status.detail).toBe("unexpected verifier edge case");
  });

  it("keeps OP Stack success wording explicit about non-equivalence", () => {
    const status = classifyConsensusStatus(
      makeEvidence("opstack"),
      makeConsensusVerification({
        valid: true,
        state_root_matches: true,
        verified_state_root: `0x${"a".repeat(64)}`,
        verified_block_number: 777,
        error: null,
        error_code: null,
      }),
      "fallback summary"
    );
    expect(status.status).toBe("check");
    expect(status.detail).toContain("OP Stack");
    expect(status.detail).toContain("not equivalent to Beacon finality");
  });

  it("keeps Linea success wording explicit about non-equivalence", () => {
    const status = classifyConsensusStatus(
      makeEvidence("linea"),
      makeConsensusVerification({
        valid: true,
        state_root_matches: true,
        verified_state_root: `0x${"a".repeat(64)}`,
        verified_block_number: 888,
        error: null,
        error_code: null,
      }),
      "fallback summary"
    );
    expect(status.status).toBe("check");
    expect(status.detail).toContain("Linea");
    expect(status.detail).toContain("not equivalent to Beacon finality");
  });
});
