/**
 * Deterministic reason codes for consensus trust-upgrade decisions.
 *
 * These codes are part of the trust boundary contract between verification
 * logic and report/rendering surfaces. Keep them machine-readable and stable.
 */
export const CONSENSUS_TRUST_DECISION_REASONS = [
  // Consensus mode rollout is intentionally disabled by feature flag.
  "consensus-mode-disabled-by-feature-flag",
  // Consensus mode is unknown to the desktop verifier.
  "unsupported-consensus-mode",
  // Consensus mode is known, but envelope chain is outside supported rollout scope.
  "unsupported-network",
  // Envelope metadata network label does not match expected chain metadata.
  "envelope-network-mismatch",
  // Mode-specific envelope checks passed, but cryptographic verification is pending.
  "opstack-consensus-verifier-pending",
  "linea-consensus-verifier-pending",
  // Local desktop consensus verification did not succeed yet.
  "missing-or-invalid-consensus-result",
  // Consensus envelope timestamp is too old at package generation time.
  "stale-consensus-envelope",
  // Consensus envelope did not use a finalized execution header.
  "non-finalized-consensus-envelope",
  // Consensus envelope payload is malformed or fails structural integrity checks.
  "invalid-proof-payload",
  // On-chain policy proof did not provide a parseable expected state root.
  "invalid-expected-state-root",
  // Required payload artifacts are missing.
  "missing-consensus-or-policy-proof",
  // Verifier did not emit required root+block outputs.
  "missing-verified-root-or-block",
  // Verifier explicitly reported a root mismatch.
  "state-root-mismatch-flag",
  // Verifier root does not match independent policy proof root.
  "state-root-mismatch-policy-proof",
  // Verifier block number does not match independent policy proof block.
  "block-number-mismatch-policy-proof",
] as const;

export type ConsensusTrustDecisionReason =
  | (typeof CONSENSUS_TRUST_DECISION_REASONS)[number]
  | null;

const CONSENSUS_ERROR_CODE_TO_TRUST_REASON: Readonly<
  Record<string, Exclude<ConsensusTrustDecisionReason, null>>
> = {
  "unsupported-consensus-mode": "unsupported-consensus-mode",
  "unsupported-network": "unsupported-network",
  "envelope-network-mismatch": "envelope-network-mismatch",
  "opstack-consensus-verifier-pending": "opstack-consensus-verifier-pending",
  "linea-consensus-verifier-pending": "linea-consensus-verifier-pending",
  "state-root-mismatch": "state-root-mismatch-flag",
  "stale-consensus-envelope": "stale-consensus-envelope",
  "non-finalized-consensus-envelope": "non-finalized-consensus-envelope",
  "invalid-proof-payload": "invalid-proof-payload",
  "envelope-state-root-mismatch": "invalid-proof-payload",
  "envelope-block-number-mismatch": "invalid-proof-payload",
  "invalid-expected-state-root": "invalid-expected-state-root",
};

const WARNING_CONSENSUS_TRUST_REASONS = new Set<
  Exclude<ConsensusTrustDecisionReason, null>
>([
  "consensus-mode-disabled-by-feature-flag",
  "unsupported-consensus-mode",
  "unsupported-network",
  "opstack-consensus-verifier-pending",
  "linea-consensus-verifier-pending",
  "stale-consensus-envelope",
  "non-finalized-consensus-envelope",
]);

export const CONSENSUS_TRUST_DECISION_SUMMARY_BY_REASON: Record<
  Exclude<ConsensusTrustDecisionReason, null>,
  string
> = {
  "consensus-mode-disabled-by-feature-flag":
    "consensus mode rollout is currently disabled by feature flag",
  "unsupported-consensus-mode":
    "consensus mode is not supported by the desktop verifier",
  "unsupported-network":
    "consensus envelope chain is not supported for this consensus mode",
  "envelope-network-mismatch":
    "consensus envelope network metadata does not match expected chain metadata",
  "opstack-consensus-verifier-pending":
    "OP Stack envelope checks passed but cryptographic consensus verification is still pending",
  "linea-consensus-verifier-pending":
    "Linea envelope checks passed but cryptographic consensus verification is still pending",
  "missing-or-invalid-consensus-result":
    "local consensus verification has not succeeded",
  "stale-consensus-envelope":
    "consensus envelope timestamp is stale relative to package time",
  "non-finalized-consensus-envelope":
    "consensus envelope did not use a finalized execution header",
  "invalid-proof-payload":
    "consensus envelope payload is malformed or failed integrity validation",
  "invalid-expected-state-root":
    "on-chain policy proof state root is invalid and cannot be verified",
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

/**
 * Maps machine-readable verifier error_code values to deterministic trust reasons.
 * Keeping this mapping in one place reduces drift as new verifier codes land.
 */
export function mapConsensusVerifierErrorCodeToTrustReason(
  errorCode: string | null | undefined
): Exclude<ConsensusTrustDecisionReason, null> | null {
  if (!errorCode) {
    return null;
  }

  return CONSENSUS_ERROR_CODE_TO_TRUST_REASON[errorCode] ?? null;
}

export function isWarningConsensusTrustDecisionReason(
  reason: ConsensusTrustDecisionReason | undefined
): boolean {
  if (!reason) {
    return false;
  }

  return WARNING_CONSENSUS_TRUST_REASONS.has(reason);
}
