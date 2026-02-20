import { describe, expect, it } from "vitest";
import {
  CONSENSUS_TRUST_DECISION_REASONS,
  CONSENSUS_TRUST_DECISION_SUMMARY_BY_REASON,
  isWarningConsensusTrustDecisionReason,
  mapConsensusVerifierErrorCodeToTrustReason,
  summarizeConsensusTrustDecisionReason,
} from "../consensus-trust";

describe("consensus trust reason contract", () => {
  it("has an explicit summary for every non-null reason code", () => {
    expect(CONSENSUS_TRUST_DECISION_REASONS.length).toBeGreaterThan(0);

    for (const reason of CONSENSUS_TRUST_DECISION_REASONS) {
      const summary = CONSENSUS_TRUST_DECISION_SUMMARY_BY_REASON[reason];
      expect(summary).toBeTypeOf("string");
      expect(summary.trim().length).toBeGreaterThan(0);
      expect(summarizeConsensusTrustDecisionReason(reason)).toBe(summary);
    }
  });

  it("returns null summary for null/undefined reasons", () => {
    expect(summarizeConsensusTrustDecisionReason(null)).toBeNull();
    expect(summarizeConsensusTrustDecisionReason(undefined)).toBeNull();
  });

  it("maps known verifier error codes to deterministic trust reasons", () => {
    expect(mapConsensusVerifierErrorCodeToTrustReason("unsupported-network")).toBe(
      "unsupported-network"
    );
    expect(
      mapConsensusVerifierErrorCodeToTrustReason("envelope-network-mismatch")
    ).toBe("envelope-network-mismatch");
    expect(
      mapConsensusVerifierErrorCodeToTrustReason("envelope-state-root-mismatch")
    ).toBe("invalid-proof-payload");
    expect(
      mapConsensusVerifierErrorCodeToTrustReason("non-finalized-consensus-envelope")
    ).toBe("non-finalized-consensus-envelope");
  });

  it("returns null for unknown verifier error codes", () => {
    expect(mapConsensusVerifierErrorCodeToTrustReason("some-new-code")).toBeNull();
    expect(mapConsensusVerifierErrorCodeToTrustReason(undefined)).toBeNull();
    expect(mapConsensusVerifierErrorCodeToTrustReason(null)).toBeNull();
  });

  it("classifies warning-vs-error trust reasons deterministically", () => {
    expect(isWarningConsensusTrustDecisionReason("unsupported-network")).toBe(true);
    expect(isWarningConsensusTrustDecisionReason("stale-consensus-envelope")).toBe(
      true
    );
    expect(isWarningConsensusTrustDecisionReason("invalid-proof-payload")).toBe(
      false
    );
    expect(
      isWarningConsensusTrustDecisionReason("envelope-network-mismatch")
    ).toBe(false);
    expect(
      isWarningConsensusTrustDecisionReason("state-root-mismatch-policy-proof")
    ).toBe(false);
    expect(isWarningConsensusTrustDecisionReason(null)).toBe(false);
  });
});
