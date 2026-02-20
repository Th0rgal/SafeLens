import { describe, expect, it } from "vitest";
import {
  CONSENSUS_VERIFIER_ERROR_CODES,
  isConsensusVerifierErrorCode,
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
      mapConsensusVerifierErrorCodeToTrustReason("invalid-checkpoint-hash")
    ).toBe("invalid-proof-payload");
    expect(
      mapConsensusVerifierErrorCodeToTrustReason("bootstrap-verification-failed")
    ).toBe("invalid-proof-payload");
    expect(
      mapConsensusVerifierErrorCodeToTrustReason("missing-execution-payload")
    ).toBe("invalid-proof-payload");
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

  it("maps every current desktop verifier machine error code deterministically", () => {
    const expectedMappings: Array<[string, string]> = [
      ["unsupported-network", "unsupported-network"],
      ["envelope-network-mismatch", "envelope-network-mismatch"],
      ["unsupported-consensus-mode", "unsupported-consensus-mode"],
      ["opstack-consensus-verifier-pending", "opstack-consensus-verifier-pending"],
      ["linea-consensus-verifier-pending", "linea-consensus-verifier-pending"],
      ["invalid-checkpoint-hash", "invalid-proof-payload"],
      ["invalid-bootstrap-json", "invalid-proof-payload"],
      ["bootstrap-verification-failed", "invalid-proof-payload"],
      ["invalid-update-json", "invalid-proof-payload"],
      ["update-verification-failed", "invalid-proof-payload"],
      ["invalid-finality-update-json", "invalid-proof-payload"],
      ["finality-verification-failed", "invalid-proof-payload"],
      ["missing-execution-payload", "invalid-proof-payload"],
      ["invalid-expected-state-root", "invalid-expected-state-root"],
      ["state-root-mismatch", "state-root-mismatch-flag"],
      ["envelope-state-root-mismatch", "invalid-proof-payload"],
      ["envelope-block-number-mismatch", "invalid-proof-payload"],
      ["invalid-proof-payload", "invalid-proof-payload"],
      ["stale-consensus-envelope", "stale-consensus-envelope"],
      ["non-finalized-consensus-envelope", "non-finalized-consensus-envelope"],
    ];

    for (const [errorCode, expectedReason] of expectedMappings) {
      expect(mapConsensusVerifierErrorCodeToTrustReason(errorCode)).toBe(
        expectedReason
      );
    }
  });

  it("returns null for unknown verifier error codes", () => {
    expect(mapConsensusVerifierErrorCodeToTrustReason("some-new-code")).toBeNull();
    expect(mapConsensusVerifierErrorCodeToTrustReason(undefined)).toBeNull();
    expect(mapConsensusVerifierErrorCodeToTrustReason(null)).toBeNull();
  });

  it("exposes a deterministic verifier error-code type guard", () => {
    for (const code of CONSENSUS_VERIFIER_ERROR_CODES) {
      expect(isConsensusVerifierErrorCode(code)).toBe(true);
    }
    expect(isConsensusVerifierErrorCode("some-new-code")).toBe(false);
    expect(isConsensusVerifierErrorCode(undefined)).toBe(false);
    expect(isConsensusVerifierErrorCode(null)).toBe(false);
  });

  it("classifies warning-vs-error trust reasons deterministically", () => {
    expect(isWarningConsensusTrustDecisionReason("unsupported-network")).toBe(true);
    expect(
      isWarningConsensusTrustDecisionReason("consensus-proof-fetch-failed")
    ).toBe(true);
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
