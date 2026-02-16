import type { EvidencePackage } from "@safelens/core";
import { exportEvidencePackage } from "@safelens/core";

export function buildEvidenceFilename(params: {
  safeAddress: string;
  nonce: number;
}): string {
  return `evidence-${params.safeAddress.slice(0, 10)}-${params.nonce}.json`;
}

export function downloadEvidencePackage(evidence: EvidencePackage) {
  const json = exportEvidencePackage(evidence);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildEvidenceFilename({
    safeAddress: evidence.safeAddress,
    nonce: evidence.transaction.nonce,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
