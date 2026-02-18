import type { EvidencePackage, SafeTransaction } from "../types";
import type { Address } from "viem";
import { getSafeApiUrl } from "../safe/url-parser";
import {
  fetchOnchainPolicyProof,
  type FetchOnchainProofOptions,
} from "../proof";

/**
 * Create an evidence package from a Safe transaction
 */
export function createEvidencePackage(
  transaction: SafeTransaction,
  chainId: number,
  transactionUrl: string
): EvidencePackage {
  const evidence: EvidencePackage = {
    version: "1.0",
    safeAddress: transaction.safe,
    safeTxHash: transaction.safeTxHash,
    chainId,
    transaction: {
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
      operation: transaction.operation,
      nonce: transaction.nonce,
      safeTxGas: transaction.safeTxGas,
      baseGas: transaction.baseGas,
      gasPrice: transaction.gasPrice,
      gasToken: transaction.gasToken,
      refundReceiver: transaction.refundReceiver,
    },
    confirmations: transaction.confirmations.map((c) => ({
      owner: c.owner,
      signature: c.signature,
      submissionDate: c.submissionDate,
    })),
    confirmationsRequired: transaction.confirmationsRequired,
    ethereumTxHash: transaction.transactionHash,
    dataDecoded: transaction.dataDecoded ?? null,
    sources: {
      safeApiUrl: getSafeApiUrl(chainId),
      transactionUrl,
    },
    packagedAt: new Date().toISOString(),
  };

  return evidence;
}

/**
 * Enrich an evidence package with an on-chain policy proof.
 *
 * Fetches `eth_getProof` for the Safe at the latest (or specified) block,
 * walks the owner/module linked lists, and attaches the result as
 * `onchainPolicyProof`. Bumps version to "1.1".
 */
export async function enrichWithOnchainProof(
  evidence: EvidencePackage,
  options: FetchOnchainProofOptions = {}
): Promise<EvidencePackage> {
  const proof = await fetchOnchainPolicyProof(
    evidence.safeAddress as Address,
    evidence.chainId,
    options
  );

  return {
    ...evidence,
    version: "1.1",
    onchainPolicyProof: proof,
  };
}

/**
 * Export evidence package as JSON string
 */
export function exportEvidencePackage(evidence: EvidencePackage): string {
  return JSON.stringify(evidence, null, 2);
}
