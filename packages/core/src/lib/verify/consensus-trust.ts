export type ConsensusTrustDecisionReason =
  | "missing-or-invalid-consensus-result"
  | "missing-consensus-or-policy-proof"
  | "missing-verified-root-or-block"
  | "state-root-mismatch-flag"
  | "state-root-mismatch-policy-proof"
  | "block-number-mismatch-policy-proof"
  | null;

export const CONSENSUS_TRUST_DECISION_SUMMARY_BY_REASON: Record<
  Exclude<ConsensusTrustDecisionReason, null>,
  string
> = {
  "missing-or-invalid-consensus-result":
    "local consensus verification has not succeeded",
  "missing-consensus-or-policy-proof":
    "required consensus or on-chain policy proof is missing",
  "missing-verified-root-or-block":
    "verifier output did not include verified root and block",
  "state-root-mismatch-flag":
    "light client reported a state-root mismatch",
  "state-root-mismatch-policy-proof":
    "verified root does not match on-chain policy proof root",
  "block-number-mismatch-policy-proof":
    "verified block does not match on-chain policy proof block",
};

export function summarizeConsensusTrustDecisionReason(
  reason: ConsensusTrustDecisionReason | undefined
): string | null {
  if (!reason) {
    return null;
  }

  return CONSENSUS_TRUST_DECISION_SUMMARY_BY_REASON[reason];
}
