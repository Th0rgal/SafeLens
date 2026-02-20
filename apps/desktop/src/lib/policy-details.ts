import type { PolicyProofVerificationResult } from "@safelens/core";

export type PolicyDetailRow = {
  id: string;
  label: string;
  value: string;
};

export function buildPolicyDetailRows(
  policyProof: PolicyProofVerificationResult | undefined
): PolicyDetailRow[] {
  if (!policyProof) {
    return [
      {
        id: "policy-verification-status",
        label: "Policy verification",
        value: "Running",
      },
    ];
  }

  const checksTotal = policyProof.checks.length;
  const checksPassed = policyProof.checks.filter((check) => check.passed).length;

  if (policyProof.valid) {
    return [
      {
        id: "policy-checks-passed",
        label: "Policy checks passed",
        value: `${checksPassed}/${checksTotal}`,
      },
    ];
  }

  const rows: PolicyDetailRow[] = [
    {
      id: "policy-checks-passed",
      label: "Policy checks passed",
      value: `${checksPassed}/${checksTotal}`,
    },
  ];

  if (policyProof.errors.length > 0) {
    rows.push({
      id: "policy-first-error",
      label: "Verifier error",
      value: policyProof.errors[0]!,
    });
  }

  return rows;
}
