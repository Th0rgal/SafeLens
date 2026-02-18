import type { SettingsConfig } from "../settings/types";
import { resolveAddress, resolveContract } from "../settings/resolve";

export type WarningLevel = "info" | "warning" | "danger";

export type TransactionWarning = {
  level: WarningLevel;
  message: string;
};

/**
 * Identify the proposer — the confirmation with the earliest submissionDate.
 */
export function identifyProposer(
  confirmations: { owner: string; submissionDate: string }[]
): string | null {
  if (confirmations.length === 0) return null;

  let earliest = confirmations[0];
  for (let i = 1; i < confirmations.length; i++) {
    if (confirmations[i].submissionDate < earliest.submissionDate) {
      earliest = confirmations[i];
    }
  }
  return earliest.owner;
}

/**
 * Analyze the target contract for warnings.
 * Unknown target = warning. Unknown target + DelegateCall = danger.
 */
export function analyzeTarget(
  to: string,
  operation: number,
  config: SettingsConfig,
  chainId?: number,
): TransactionWarning[] {
  const warnings: TransactionWarning[] = [];
  const resolved = resolveAddress(to, config, chainId) ?? resolveContract(to, config, chainId)?.name ?? null;

  if (resolved === null && operation === 1) {
    warnings.push({
      level: "danger",
      message: "DelegateCall to unknown contract — this executes foreign code in the Safe's context",
    });
  } else if (operation === 1) {
    warnings.push({
      level: "info",
      message: `DelegateCall to ${resolved}`,
    });
  }

  return warnings;
}

/**
 * Analyze each signer, returning warnings keyed by owner address.
 * Unknown signers get a warning.
 */
export function analyzeSigners(
  confirmations: { owner: string }[],
  config: SettingsConfig,
  chainId?: number,
): Record<string, TransactionWarning[]> {
  const results: Record<string, TransactionWarning[]> = {};

  for (const conf of confirmations) {
    const warnings: TransactionWarning[] = [];
    const resolved = resolveAddress(conf.owner, config, chainId) ?? resolveContract(conf.owner, config, chainId)?.name ?? null;

    if (resolved === null) {
      warnings.push({
        level: "warning",
        message: "Unknown signer — not in your address registry",
      });
    }

    results[conf.owner] = warnings;
  }

  return results;
}
