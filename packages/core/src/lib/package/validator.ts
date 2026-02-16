import { evidencePackageSchema, EvidencePackage } from "../types";
import { computeSafeTxHashDetailed, verifySafeTxHashDetailed } from "../safe/hash";
import type { Hex } from "viem";
import type { SafeTxHashDetails } from "../safe/hash";

/**
 * Validate an evidence package
 */
export function validateEvidencePackage(json: unknown): {
  valid: boolean;
  evidence?: EvidencePackage;
  errors: string[];
  hashDetails?: SafeTxHashDetails;
} {
  const errors: string[] = [];

  // Step 1: Validate schema
  try {
    const evidence = evidencePackageSchema.parse(json);

    // Step 2: Recompute Safe tx hash with detailed intermediate hashes
    const hashDetails = computeSafeTxHashDetailed({
      safeAddress: evidence.safeAddress as Hex,
      chainId: evidence.chainId,
      to: evidence.transaction.to as Hex,
      value: BigInt(evidence.transaction.value),
      data: (evidence.transaction.data || "0x") as Hex,
      operation: evidence.transaction.operation,
      safeTxGas: BigInt(evidence.transaction.safeTxGas),
      baseGas: BigInt(evidence.transaction.baseGas),
      gasPrice: BigInt(evidence.transaction.gasPrice),
      gasToken: evidence.transaction.gasToken as Hex,
      refundReceiver: evidence.transaction.refundReceiver as Hex,
      nonce: evidence.transaction.nonce,
    });

    const hashVerification = verifySafeTxHashDetailed(hashDetails, evidence.safeTxHash as Hex);

    if (!hashVerification.valid) {
      errors.push(
        `Safe tx hash mismatch. Computed: ${hashVerification.computed}, Expected: ${hashVerification.expected}`
      );
    }

    return {
      valid: errors.length === 0,
      evidence,
      errors,
      hashDetails,
    };
  } catch (error) {
    if (error instanceof Error) {
      errors.push(`Schema validation failed: ${error.message}`);
    } else {
      errors.push("Schema validation failed");
    }

    return {
      valid: false,
      errors,
    };
  }
}

/**
 * Parse evidence package from JSON string
 */
export function parseEvidencePackage(jsonString: string): {
  valid: boolean;
  evidence?: EvidencePackage;
  errors: string[];
  hashDetails?: SafeTxHashDetails;
} {
  try {
    const json = JSON.parse(jsonString);
    return validateEvidencePackage(json);
  } catch (error) {
    return {
      valid: false,
      errors: ["Invalid JSON format"],
    };
  }
}
