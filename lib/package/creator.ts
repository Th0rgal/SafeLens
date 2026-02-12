import { EvidencePackage, SafeTransaction } from "../types";
import { getSafeApiUrl } from "../safe/url-parser";

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
 * Export evidence package as JSON string
 */
export function exportEvidencePackage(evidence: EvidencePackage): string {
  return JSON.stringify(evidence, null, 2);
}

/**
 * Download evidence package as a file
 */
export function downloadEvidencePackage(evidence: EvidencePackage) {
  const json = exportEvidencePackage(evidence);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `evidence-${evidence.safeAddress.slice(0, 10)}-${evidence.transaction.nonce}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
