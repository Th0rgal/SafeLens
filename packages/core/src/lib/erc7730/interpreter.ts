/**
 * Generic ERC-7730 transaction interpreter.
 *
 * Matches transactions against the ERC-7730 descriptor index and produces
 * human-readable interpretations.
 */

import { decodeFunctionData, formatUnits, parseAbiItem } from "viem";
import type { Abi } from "viem";
import type { Interpretation } from "../interpret/types";
import type { DescriptorIndex, IndexEntry } from "./index";
import { lookupFormat, lookupFormatByMethodName } from "./index";
import type { FieldDefinition, ERC7730Descriptor } from "./types";

// ── Field value extraction ──────────────────────────────────────────

interface DataDecoded {
  method: string;
  parameters?: Array<{
    name: string;
    type: string;
    value: string | unknown;
  }>;
}

/**
 * Extract a value from dataDecoded using a JSONPath-like expression.
 *
 * Supported paths:
 * - #.paramName — calldata parameter
 * - @.value — transaction ETH value
 * - @.from — transaction sender
 * - @.to — transaction recipient
 * - $.metadata.constants.X — metadata constant (resolved before this)
 */
function extractValue(
  path: string,
  dataDecoded: DataDecoded,
  txValue?: string,
  txFrom?: string,
  txTo?: string
): string | null {
  // Calldata parameter: #.paramName
  if (path.startsWith("#.")) {
    const paramName = path.substring(2);
    const param = dataDecoded.parameters?.find((p) => p.name === paramName);
    if (!param) return null;

    // Handle struct parameters (e.g., #.params.tokenIn)
    if (paramName.includes(".") && typeof param.value === "object" && param.value !== null) {
      const parts = paramName.split(".");
      let value: any = param.value;
      for (const part of parts.slice(1)) {
        value = value?.[part];
      }
      return value ? String(value) : null;
    }

    return String(param.value);
  }

  // Transaction value: @.value
  if (path === "@.value") {
    return txValue ?? null;
  }

  // Transaction from: @.from
  if (path === "@.from") {
    return txFrom ?? null;
  }

  // Transaction to: @.to
  if (path === "@.to") {
    return txTo ?? null;
  }

  // Bare dotted path (e.g. "makerOrder.takingAmount") — used by ERC-7730 descriptors
  // These reference calldata parameters by their ERC-7730 name, not by #. prefix.
  if (path.includes(".") && !path.startsWith("$")) {
    const parts = path.split(".");
    const paramName = parts[0];
    const param = dataDecoded.parameters?.find((p) => p.name === paramName);
    if (!param) return null;

    if (parts.length === 1) {
      return String(param.value);
    }

    // Traverse into nested struct
    let value: any = param.value;
    for (const part of parts.slice(1)) {
      value = value?.[part];
    }
    return value != null ? String(value) : null;
  }

  return null;
}

// ── Raw calldata decoding ──────────────────────────────────────────

/**
 * Decode raw calldata using the ERC-7730 format key as ABI.
 *
 * Converts the decoded args into a DataDecoded structure that extractValue
 * can work with, preserving the parameter names from the signature.
 */
function decodeRawCalldata(
  txData: string,
  entry: IndexEntry,
): DataDecoded | null {
  try {
    const formatKey = entry.formatKey;
    // parseAbiItem needs "function " prefix
    const abiSig = formatKey.startsWith("function ")
      ? formatKey
      : `function ${formatKey}`;
    const abiItem = parseAbiItem(abiSig);

    if (abiItem.type !== "function") return null;

    const decoded = decodeFunctionData({
      abi: [abiItem] as Abi,
      data: txData as `0x${string}`,
    });

    // Convert decoded args into DataDecoded parameters
    const parameters: DataDecoded["parameters"] = [];

    if (decoded.args && abiItem.inputs) {
      for (let i = 0; i < abiItem.inputs.length; i++) {
        const input = abiItem.inputs[i];
        const arg = decoded.args[i];

        parameters.push({
          name: input.name ?? `arg${i}`,
          type: input.type,
          value: convertBigInts(arg),
        });
      }
    }

    return {
      method: decoded.functionName,
      parameters,
    };
  } catch {
    return null;
  }
}

/**
 * Recursively convert BigInt values to strings for display.
 */
function convertBigInts(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(convertBigInts);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = convertBigInts(v);
    }
    return result;
  }
  return value;
}

// ── Field formatting ────────────────────────────────────────────────

/**
 * Try to convert a decimal uint256 string to a 0x hex address.
 * Returns the value unchanged if it's already a hex address.
 */
function toAddress(value: string): string {
  if (value.startsWith("0x")) return value;
  try {
    const hex = BigInt(value).toString(16).padStart(40, "0");
    return `0x${hex.slice(-40)}`;
  } catch {
    return value;
  }
}

/**
 * Format a raw value according to its field definition.
 */
function formatValue(
  value: string,
  field: FieldDefinition,
  descriptor: ERC7730Descriptor,
  dataDecoded?: DataDecoded,
): string {
  const format = field.format ?? "raw";

  switch (format) {
    case "raw":
      return value;

    case "addressName":
      // Convert uint256-encoded addresses to hex format
      return toAddress(value);

    case "amount":
      // Native currency (ETH) — 18 decimals
      try {
        const formatted = formatUnits(BigInt(value), 18);
        return `${formatted} ETH`;
      } catch {
        return value;
      }

    case "tokenAmount": {
      // Use metadata.token if available (static decimals/symbol)
      if (descriptor.metadata.token) {
        const { decimals, ticker: symbol } = descriptor.metadata.token;
        try {
          const formatted = formatUnits(BigInt(value), decimals);
          return symbol ? `${formatted} ${symbol}` : formatted;
        } catch {
          return value;
        }
      }

      // No static token metadata — resolve tokenPath to show token address
      const tokenPath =
        (field.params?.tokenPath as string) ?? field.tokenPath;
      if (tokenPath && dataDecoded) {
        const tokenAddressRaw = extractValue(tokenPath, dataDecoded);
        if (tokenAddressRaw) {
          const tokenAddress = toAddress(tokenAddressRaw);
          return `${value} (token: ${tokenAddress})`;
        }
      }

      // Fallback: raw value without assuming 18 decimals
      return value;
    }

    case "date":
      // Unix timestamp to locale date string
      try {
        const timestamp = parseInt(value, 10);
        const date = new Date(timestamp * 1000);
        return date.toLocaleString();
      } catch {
        return value;
      }

    case "unit":
      // Numeric value with unit suffix
      return field.unit ? `${value} ${field.unit}` : value;

    case "percentage":
      // Convert basis points to percentage (if unit is "bps")
      if (field.unit === "bps") {
        try {
          const bps = parseInt(value, 10);
          return `${(bps / 100).toFixed(2)}%`;
        } catch {
          return value;
        }
      }
      return `${value}%`;

    case "enum": {
      // Map numeric value to label via metadata.enums
      if (!field.enum || !descriptor.metadata.enums) {
        return value;
      }
      const enumDef = descriptor.metadata.enums[field.enum];
      if (!enumDef) return value;
      return enumDef[value] ?? value;
    }

    default:
      return value;
  }
}

// ── Interpreter ─────────────────────────────────────────────────────

export interface ERC7730Details {
  fields: Array<{
    label: string;
    value: string;
    format: string;
  }>;
}

/**
 * Get all unique chain IDs from the descriptor index.
 */
function getIndexChainIds(index: DescriptorIndex): number[] {
  const chainIds = new Set<number>();
  
  for (const descriptor of index.descriptors) {
    const deployments = [
      ...(descriptor.context.contract?.deployments ?? []),
      ...(descriptor.context.eip712?.deployments ?? []),
    ];
    for (const deployment of deployments) {
      chainIds.add(deployment.chainId);
    }
  }
  
  return Array.from(chainIds);
}

/**
 * Create an ERC-7730 interpreter bound to a descriptor index.
 *
 * @param index The descriptor index to use for lookups
 */
export function createERC7730Interpreter(index: DescriptorIndex) {
  // Get all chain IDs present in the index
  const chainIds = getIndexChainIds(index);
  
  return function interpretERC7730(
    dataDecoded: unknown,
    txTo: string,
    _txOperation: number,
    txData?: string | null,
  ): Interpretation | null {
    // Try decoded method lookup first
    if (
      dataDecoded &&
      typeof dataDecoded === "object" &&
      "method" in dataDecoded
    ) {
      const decoded = dataDecoded as DataDecoded;

      for (const chainId of chainIds) {
        const entry = lookupFormatByMethodName(index, chainId, txTo, decoded.method);
        if (entry) {
          return buildInterpretation(entry, decoded, txTo);
        }
      }
    }

    // Fallback: extract 4-byte selector from raw calldata and decode it
    if (txData && txData.length >= 10) {
      const selector = txData.slice(0, 10).toLowerCase();

      for (const chainId of chainIds) {
        const entry = lookupFormat(index, chainId, txTo, selector);
        if (entry) {
          // Try to decode raw calldata using the ERC-7730 signature
          const decoded = decodeRawCalldata(txData, entry);
          if (decoded) {
            return buildInterpretation(entry, decoded, txTo);
          }

          // Decoding failed — return interpretation with intent only
          const intent = entry.formatEntry.intent ?? "Transaction";
          return {
            id: "erc7730",
            protocol: entry.descriptor.metadata.owner,
            action: intent,
            severity: "info",
            summary: intent,
            details: { fields: [] },
          };
        }
      }
    }

    return null;
  };
}

/**
 * Build an interpretation result from a matched index entry and decoded data.
 */
function buildInterpretation(
  entry: import("./index").IndexEntry,
  decoded: DataDecoded,
  txTo: string,
  txValue?: string,
  txFrom?: string,
): Interpretation {
  const fields: ERC7730Details["fields"] = [];

  for (const fieldDef of entry.formatEntry.fields) {
    if (!fieldDef.path) continue;

    const rawValue = extractValue(
      fieldDef.path,
      decoded,
      txValue,
      txFrom,
      txTo
    );

    if (rawValue === null) continue;

    const formattedValue = formatValue(
      rawValue,
      fieldDef,
      entry.descriptor,
      decoded,
    );

    fields.push({
      label: fieldDef.label ?? fieldDef.path ?? "Unknown",
      value: formattedValue,
      format: fieldDef.format ?? "raw",
    });
  }

  const intent = entry.formatEntry.intent ?? decoded.method;

  return {
    id: "erc7730",
    protocol: entry.descriptor.metadata.owner,
    action: intent,
    severity: "info",
    summary: intent,
    details: { fields },
  };
}
