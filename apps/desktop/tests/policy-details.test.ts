import { describe, expect, it } from "bun:test";
import type { PolicyProofVerificationResult } from "@safelens/core";
import { buildPolicyDetailRows } from "../src/lib/policy-details";

function makePolicyProof(
  overrides: Partial<PolicyProofVerificationResult>
): PolicyProofVerificationResult {
  return {
    valid: true,
    checks: [],
    errors: [],
    ...overrides,
  };
}

describe("buildPolicyDetailRows", () => {
  it("shows running status while policy verification is pending", () => {
    expect(buildPolicyDetailRows(undefined)).toEqual([
      {
        id: "policy-verification-status",
        label: "Policy verification",
        value: "Running",
      },
    ]);
  });

  it("returns concise pass summary for valid proofs", () => {
    const rows = buildPolicyDetailRows(
      makePolicyProof({
        valid: true,
        checks: [
          { id: "owners", label: "Owners match", passed: true },
          { id: "threshold", label: "Threshold matches", passed: true },
        ],
      })
    );

    expect(rows).toEqual([
      {
        id: "policy-checks-passed",
        label: "Policy checks passed",
        value: "2/2",
      },
    ]);
  });

  it("returns concise failure summary with first verifier error", () => {
    const rows = buildPolicyDetailRows(
      makePolicyProof({
        valid: false,
        checks: [
          { id: "owners", label: "Owners match", passed: true },
          { id: "threshold", label: "Threshold matches", passed: false },
        ],
        errors: ["threshold mismatch", "another error"],
      })
    );

    expect(rows).toEqual([
      {
        id: "policy-checks-passed",
        label: "Policy checks passed",
        value: "1/2",
      },
      {
        id: "policy-first-error",
        label: "Verifier error",
        value: "threshold mismatch",
      },
    ]);
  });
});
