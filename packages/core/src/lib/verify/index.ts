import { analyzeTarget, identifyProposer, type TransactionWarning } from "../warnings/analyze";
import type { EvidencePackage } from "../types";
import { verifySignature, type SignatureCheckResult } from "../safe/signatures";
import type { SettingsConfig } from "../settings/types";
import type { Address, Hash, Hex } from "viem";

export type SignatureCheckSummary = {
  total: number;
  valid: number;
  invalid: number;
  unsupported: number;
};

export type SignatureCheckEntry = {
  owner: string;
  result: SignatureCheckResult;
};

export type SignatureCheckBundle = {
  list: SignatureCheckEntry[];
  byOwner: Record<string, SignatureCheckResult>;
  summary: SignatureCheckSummary;
};

export type EvidenceVerificationReport = {
  proposer: string | null;
  targetWarnings: TransactionWarning[];
  signatures: SignatureCheckBundle;
};

export interface VerifyEvidenceOptions {
  settings?: SettingsConfig | null;
}

export async function verifyEvidencePackage(
  evidence: EvidencePackage,
  options: VerifyEvidenceOptions = {}
): Promise<EvidenceVerificationReport> {
  const { settings } = options;

  const proposer = identifyProposer(evidence.confirmations);
  const targetWarnings = settings
    ? analyzeTarget(
        evidence.transaction.to,
        evidence.transaction.operation,
        settings
      )
    : [];

  const signatureList: SignatureCheckEntry[] = await Promise.all(
    evidence.confirmations.map(async (conf) => ({
      owner: conf.owner,
      result: await verifySignature(
        evidence.safeTxHash as Hash,
        conf.signature as Hex,
        conf.owner as Address
      ),
    }))
  );

  const byOwner: Record<string, SignatureCheckResult> = {};
  for (const check of signatureList) {
    byOwner[check.owner] = check.result;
  }

  const summary: SignatureCheckSummary = {
    total: signatureList.length,
    valid: 0,
    invalid: 0,
    unsupported: 0,
  };

  for (const check of signatureList) {
    if (check.result.status === "valid") summary.valid += 1;
    else if (check.result.status === "invalid") summary.invalid += 1;
    else summary.unsupported += 1;
  }

  return {
    proposer,
    targetWarnings,
    signatures: {
      list: signatureList,
      byOwner,
      summary,
    },
  };
}
