import { analyzeTarget, identifyProposer, type TransactionWarning } from "../warnings/analyze";
import type { EvidencePackage } from "../types";
import { verifySignature, type SignatureCheckResult } from "../safe/signatures";
import { computeSafeTxHashDetailed, type SafeTxHashDetails } from "../safe/hash";
import type { SettingsConfig } from "../settings/types";
import type { Address, Hash, Hex } from "viem";
import { buildVerificationSources } from "../trust";

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
  sources: ReturnType<typeof buildVerificationSources>;
  hashDetails?: SafeTxHashDetails;
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
        settings,
        evidence.chainId
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

  // Compute detailed hash information for hardware wallet verification
  const hashDetails = computeSafeTxHashDetailed({
    safeAddress: evidence.safeAddress as Address,
    chainId: evidence.chainId,
    to: evidence.transaction.to as Address,
    value: BigInt(evidence.transaction.value),
    data: evidence.transaction.data as Hex,
    operation: evidence.transaction.operation,
    safeTxGas: BigInt(evidence.transaction.safeTxGas),
    baseGas: BigInt(evidence.transaction.baseGas),
    gasPrice: BigInt(evidence.transaction.gasPrice),
    gasToken: evidence.transaction.gasToken as Address,
    refundReceiver: evidence.transaction.refundReceiver as Address,
    nonce: evidence.transaction.nonce,
  });

  return {
    proposer,
    targetWarnings,
    sources: buildVerificationSources({
      hasSettings: Boolean(settings),
      hasUnsupportedSignatures: summary.unsupported > 0,
      hasDecodedData: Boolean(evidence.dataDecoded),
    }),
    signatures: {
      list: signatureList,
      byOwner,
      summary,
    },
    hashDetails,
  };
}
