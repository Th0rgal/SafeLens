import { describe, expect, it } from "vitest";
import {
  CONSENSUS_TRUST_DECISION_REASONS,
  CONSENSUS_TRUST_DECISION_SUMMARY_BY_REASON,
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
});
