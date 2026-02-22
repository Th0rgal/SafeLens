import type { EvidencePackage } from "../types";

type ExecutionSafetyEvidence = Pick<
  EvidencePackage,
  "confirmations" | "confirmationsRequired" | "dataDecoded" | "transaction"
>;

export const CORE_EXECUTION_SAFETY_FIELD_IDS = [
  "signatures",
  "method",
  "target",
  "operation",
  "value-wei",
  "nonce",
] as const;

export type CoreExecutionSafetyFieldId =
  (typeof CORE_EXECUTION_SAFETY_FIELD_IDS)[number];

export type CoreExecutionSafetyField = {
  id: CoreExecutionSafetyFieldId;
  label: string;
  value: string;
  monospace?: boolean;
};

function getDecodedMethod(dataDecoded: unknown): string {
  if (
    typeof dataDecoded === "object" &&
    dataDecoded !== null &&
    "method" in dataDecoded &&
    typeof (dataDecoded as { method: unknown }).method === "string" &&
    (dataDecoded as { method: string }).method.length > 0
  ) {
    return (dataDecoded as { method: string }).method;
  }
  return "Unknown";
}

function getOperationLabel(operation: 0 | 1): "CALL" | "DELEGATECALL" {
  return operation === 0 ? "CALL" : "DELEGATECALL";
}

export function buildCoreExecutionSafetyFields(
  evidence: ExecutionSafetyEvidence
): CoreExecutionSafetyField[] {
  return [
    {
      id: "signatures",
      label: "Signatures",
      value: `${evidence.confirmations.length}/${evidence.confirmationsRequired}`,
      monospace: true,
    },
    {
      id: "method",
      label: "Method",
      value: getDecodedMethod(evidence.dataDecoded),
    },
    {
      id: "target",
      label: "Target",
      value: evidence.transaction.to,
      monospace: true,
    },
    {
      id: "operation",
      label: "Operation",
      value: getOperationLabel(evidence.transaction.operation),
      monospace: true,
    },
    {
      id: "value-wei",
      label: "Value (wei)",
      value: evidence.transaction.value,
      monospace: true,
    },
    {
      id: "nonce",
      label: "Nonce",
      value: String(evidence.transaction.nonce),
      monospace: true,
    },
  ];
}
