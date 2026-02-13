/**
 * Generic ERC-7730 transaction interpreter.
 *
 * Matches transactions against the ERC-7730 descriptor index and produces
 * human-readable interpretations.
 */

import { formatUnits } from "viem";
import type { Interpretation } from "../interpret/types.js";
import type { DescriptorIndex } from "./index.js";
import { lookupFormatByMethodName } from "./index.js";
import type { FieldDefinition, ERC7730Descriptor } from "./types.js";

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

  return null;
}

// ── Field formatting ────────────────────────────────────────────────

/**
 * Format a raw value according to its field definition.
 */
function formatValue(
  value: string,
  field: FieldDefinition,
  descriptor: ERC7730Descriptor
): string {
  const format = field.format ?? "raw";

  switch (format) {
    case "raw":
      return value;

    case "addressName":
      // For now, just return the address. In the future, this could
      // look up names from the contract registry or address book.
      return value;

    case "amount":
      // Native currency (ETH) — 18 decimals
      try {
        const formatted = formatUnits(BigInt(value), 18);
        return `${formatted} ETH`;
      } catch {
        return value;
      }

    case "tokenAmount": {
      // Token amount — need decimals from metadata.token or tokenPath
      const decimals = descriptor.metadata.token?.decimals ?? 18;
      const symbol = descriptor.metadata.token?.ticker ?? "";
      try {
        const formatted = formatUnits(BigInt(value), decimals);
        return symbol ? `${formatted} ${symbol}` : formatted;
      } catch {
        return value;
      }
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
 * Create an ERC-7730 interpreter bound to a descriptor index.
 *
 * @param index The descriptor index to use for lookups
 * @param chainId The chain ID (default: 1 for Ethereum mainnet)
 */
export function createERC7730Interpreter(
  index: DescriptorIndex,
  chainId: number = 1
) {
  return function interpretERC7730(
    dataDecoded: unknown,
    txTo: string,
    _txOperation: number,
    txValue?: string,
    txFrom?: string
  ): Interpretation | null {
    // Type guard for dataDecoded
    if (
      !dataDecoded ||
      typeof dataDecoded !== "object" ||
      !("method" in dataDecoded)
    ) {
      return null;
    }

    const decoded = dataDecoded as DataDecoded;

    // Lookup the format entry by method name
    const entry = lookupFormatByMethodName(index, chainId, txTo, decoded.method);
    if (!entry) {
      return null;
    }

    // Extract and format all fields
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

      if (rawValue === null) {
        // Field not found — skip it
        continue;
      }

      const formattedValue = formatValue(
        rawValue,
        fieldDef,
        entry.descriptor
      );

      fields.push({
        label: fieldDef.label,
        value: formattedValue,
        format: fieldDef.format ?? "raw",
      });
    }

    return {
      id: "erc7730",
      protocol: entry.descriptor.metadata.owner,
      action: entry.formatEntry.intent,
      severity: "info",
      summary: entry.formatEntry.intent,
      details: { fields },
    };
  };
}
