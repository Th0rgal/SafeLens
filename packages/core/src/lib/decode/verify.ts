import { toFunctionSelector, decodeAbiParameters } from "viem";
import type { Hex, AbiParameter } from "viem";
import type { CallStep } from "./types";

export type CalldataVerification =
  | { status: "verified" }
  | { status: "selector-mismatch" }
  | { status: "params-mismatch" }
  | { status: "no-data" }
  | { status: "error"; reason: string };

/** Parse a Solidity tuple type string like "(address,bytes32,bytes)" into individual types. */
function parseTupleTypes(typeStr: string): string[] {
  const inner =
    typeStr.startsWith("(") && typeStr.endsWith(")")
      ? typeStr.slice(1, -1)
      : typeStr;
  if (!inner) return [];
  const types: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      types.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) types.push(current.trim());
  return types;
}

/** Convert a Solidity type string into a viem AbiParameter for decoding. */
function toAbiParam(typeStr: string): AbiParameter {
  if (typeStr.startsWith("(")) {
    const isArray = typeStr.endsWith("[]");
    const tupleStr = isArray ? typeStr.slice(0, -2) : typeStr;
    const components = parseTupleTypes(tupleStr).map((t) => toAbiParam(t));
    return {
      type: isArray ? "tuple[]" : "tuple",
      components,
    } as AbiParameter;
  }
  return { type: typeStr } as AbiParameter;
}

/** Compare a decoded value from ABI decoding against an API-reported value. */
function valuesMatch(
  decoded: unknown,
  apiValue: unknown,
  type: string,
): boolean {
  // Address: lowercase comparison
  if (type === "address") {
    return (
      typeof decoded === "string" &&
      typeof apiValue === "string" &&
      decoded.toLowerCase() === apiValue.toLowerCase()
    );
  }

  // Integer types: compare as BigInt
  if (type.startsWith("uint") || type.startsWith("int")) {
    try {
      return (
        BigInt(decoded as string | number | bigint) ===
        BigInt(apiValue as string | number | bigint)
      );
    } catch {
      return false;
    }
  }

  // Boolean: API sends "True"/"False" strings
  if (type === "bool") {
    const toBool = (v: unknown): boolean =>
      typeof v === "boolean" ? v : String(v).toLowerCase() === "true";
    return toBool(decoded) === toBool(apiValue);
  }

  // Bytes / hex: lowercase comparison
  if (type.startsWith("bytes")) {
    return (
      typeof decoded === "string" &&
      typeof apiValue === "string" &&
      decoded.toLowerCase() === apiValue.toLowerCase()
    );
  }

  // Tuple: recursive element-wise
  if (
    type.startsWith("(") &&
    Array.isArray(decoded) &&
    Array.isArray(apiValue)
  ) {
    const elementTypes = parseTupleTypes(type);
    if (
      decoded.length !== apiValue.length ||
      decoded.length !== elementTypes.length
    )
      return false;
    return decoded.every((el, i) =>
      valuesMatch(el, apiValue[i], elementTypes[i]),
    );
  }

  // Default: strict equality
  return decoded === apiValue;
}

/**
 * Verify a CallStep's decoded method+params against its raw calldata.
 * Reconstructs the function selector and ABI-decodes parameters locally,
 * then compares against the API-reported dataDecoded.
 */
export function verifyCalldata(step: CallStep): CalldataVerification {
  if (!step.rawData || step.rawData.length < 10 || !step.method) {
    return { status: "no-data" };
  }

  try {
    // Build signature and compare selector
    const signature = `${step.method}(${step.params.map((p) => p.type).join(",")})`;
    const expectedSelector = toFunctionSelector(signature);
    const actualSelector = step.rawData.slice(0, 10).toLowerCase();

    if (expectedSelector.toLowerCase() !== actualSelector) {
      return { status: "selector-mismatch" };
    }

    // Selector-only match (no params to verify)
    if (step.params.length === 0) {
      return { status: "verified" };
    }

    // Decode parameters from calldata tail.
    // The Safe Transaction Service API sometimes truncates trailing zero words
    // (e.g. empty bytes length fields), so we pad with zeros to avoid out-of-bounds.
    const abiParams = step.params.map((p) => toAbiParam(p.type));
    const rawTail = step.rawData.slice(10);
    const calldataTail = `0x${rawTail.padEnd(rawTail.length + 256, "0")}` as Hex;
    const decoded = decodeAbiParameters(abiParams, calldataTail);

    // Compare each parameter
    for (let i = 0; i < step.params.length; i++) {
      if (!valuesMatch(decoded[i], step.params[i].value, step.params[i].type)) {
        return { status: "params-mismatch" };
      }
    }

    return { status: "verified" };
  } catch (e) {
    return {
      status: "error",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}
