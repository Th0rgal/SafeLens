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
    expect(status.reasonCode).toBeUndefined();
  });

  it("surfaces deterministic reason code/details for feature-flag disabled consensus mode", () => {
    const status = classifyConsensusStatus(
      {
        exportContract: {
          reasons: ["consensus-mode-disabled-by-feature-flag"],
        },
      } as EvidencePackage,
      undefined,
      "fallback summary"
    );

    expect(status.status).toBe("warning");
    expect(status.reasonCode).toBe("consensus-mode-disabled-by-feature-flag");
    expect(status.detail).toBe(
      "Consensus verification for this mode is disabled in this build."
    );
  });

  it("surfaces deterministic reason code/details for consensus fetch failures", () => {
    const status = classifyConsensusStatus(
      {
        exportContract: {
          reasons: ["consensus-proof-fetch-failed"],
        },
      } as EvidencePackage,
      undefined,
      "fallback summary"
    );

    expect(status.status).toBe("warning");
    expect(status.reasonCode).toBe("consensus-proof-fetch-failed");
    expect(status.detail).toBe(
      "Consensus proof generation failed during package creation. Regenerate the package and retry."
    );
  });

  it("falls back to default no-proof detail when summary is empty", () => {
    const status = classifyConsensusStatus(makeEvidence(), undefined, "");
    expect(status.status).toBe("warning");
    expect(status.detail).toContain("No consensus proof");
  });

  it("surfaces legacy pending reason for opstack when verifier output is absent", () => {
    const status = classifyConsensusStatus(
      {
        consensusProof: { consensusMode: "opstack" } as EvidencePackage["consensusProof"],
        exportContract: {
          reasons: ["opstack-consensus-verifier-pending"],
        },
      } as EvidencePackage,
      undefined,
      "fallback summary"
    );

    expect(status.status).toBe("warning");
    expect(status.reasonCode).toBe("opstack-consensus-verifier-pending");
    expect(status.detail).toContain("legacy pending-verifier reason");
  });

  it("surfaces legacy pending reason for linea when verifier output is absent", () => {
    const status = classifyConsensusStatus(
      {
        consensusProof: { consensusMode: "linea" } as EvidencePackage["consensusProof"],
        exportContract: {
          reasons: ["linea-consensus-verifier-pending"],
        },
      } as EvidencePackage,
      undefined,
      "fallback summary"
    );

    expect(status.status).toBe("warning");
    expect(status.reasonCode).toBe("linea-consensus-verifier-pending");
    expect(status.detail).toContain("legacy pending-verifier reason");
  });

  it("uses unavailable-in-session wording when verifier output is absent without export reason", () => {
    const status = classifyConsensusStatus(
      {
        consensusProof: { consensusMode: "opstack" } as EvidencePackage["consensusProof"],
      } as EvidencePackage,
      undefined,
      "fallback summary"
    );

    expect(status.status).toBe("warning");
    expect(status.reasonCode).toBeUndefined();
    expect(status.detail).toContain("unavailable in this session");
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
    expect(status.reasonCode).toBe("unsupported-network");
  });

  it("returns warning for unsupported consensus modes reported by verifier", () => {
    const status = classifyConsensusStatus(
      makeEvidence("opstack"),
      makeConsensusVerification({
        valid: false,
        error: "unsupported consensus mode",
        error_code: "unsupported-consensus-mode",
      }),
      "fallback summary"
    );
    expect(status.status).toBe("warning");
    expect(status.detail).toBe(
      "This package uses a consensus mode the desktop verifier does not support."
    );
    expect(status.reasonCode).toBe("unsupported-consensus-mode");
  });

  it("returns warning with explicit stale guidance for Linea stale envelopes", () => {
    const status = classifyConsensusStatus(
      makeEvidence("linea"),
      makeConsensusVerification({
        valid: false,
        error:
          "Consensus envelope block timestamp is stale relative to package timestamp.",
        error_code: "stale-consensus-envelope",
      }),
      "fallback summary"
    );
    expect(status.status).toBe("warning");
    expect(status.detail).toBe(
      "Consensus envelope is stale versus package creation time. Regenerate evidence with fresher consensus data."
    );
    expect(status.reasonCode).toBe("stale-consensus-envelope");
  });

  it("returns error for envelope network metadata mismatches", () => {
    const status = classifyConsensusStatus(
      makeEvidence("opstack"),
      makeConsensusVerification({
        valid: false,
        error: "Package network metadata mismatch",
        error_code: "envelope-network-mismatch",
      }),
      "fallback summary"
    );
    expect(status.status).toBe("error");
    expect(status.detail).toBe(
      "Package network metadata does not match the consensus envelope chain metadata."
    );
    expect(status.reasonCode).toBe("envelope-network-mismatch");
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
    expect(status.reasonCode).toBe("state-root-mismatch");
  });

  it("maps envelope linkage mismatch codes to explicit integrity details", () => {
    const status = classifyConsensusStatus(
      makeEvidence("opstack"),
      makeConsensusVerification({
        valid: false,
        error: "Envelope block number does not match package consensusProof.blockNumber.",
        error_code: "envelope-block-number-mismatch",
      }),
      "fallback summary"
    );
    expect(status.status).toBe("error");
    expect(status.detail).toBe(
      "Consensus envelope block number does not match the package consensus proof."
    );
    expect(status.reasonCode).toBe("envelope-block-number-mismatch");
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
    expect(status.reasonCode).toBe("some-new-error-code");
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
