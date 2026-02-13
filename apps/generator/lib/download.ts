import type { EvidencePackage } from "@safelens/core";
import { exportEvidencePackage } from "@safelens/core";

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
