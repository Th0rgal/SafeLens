/**
 * ERC-7730 descriptor index.
 *
 * Builds a lookup table from (chainId, address, selector) -> format entry.
 */

import { keccak256, toBytes, toHex } from "viem";
import type { ERC7730Descriptor, FormatEntry } from "./types";
import { resolveDescriptor } from "./resolve";

// ── Index types ─────────────────────────────────────────────────────

export interface IndexEntry {
  descriptor: ERC7730Descriptor;
  formatEntry: FormatEntry;
  selector: string; // 4-byte hex selector (e.g. "0x12345678")
}

export interface DescriptorIndex {
  /** Map from "chainId:address:selector" -> IndexEntry */
  entries: Map<string, IndexEntry>;
  /** Map from "chainId:address:methodName" -> IndexEntry[] (for ambiguous lookups) */
  methodEntries: Map<string, IndexEntry[]>;
  /** All loaded descriptors */
  descriptors: ERC7730Descriptor[];
}

// ── Selector computation ────────────────────────────────────────────

/**
 * Compute the 4-byte selector from a function signature.
 * Example: "transfer(address,uint256)" -> "0xa9059cbb"
 */
export function computeSelector(signature: string): string {
  const hash = keccak256(toBytes(signature));
  return toHex(toBytes(hash).slice(0, 4));
}

/**
 * Check if a string is already a 4-byte hex selector (e.g. "0x12345678").
 */
export function isSelector(key: string): boolean {
  return /^0x[0-9a-fA-F]{8}$/.test(key);
}

/**
 * Normalize a format key to a 4-byte selector.
 * If it's already a selector, return as-is.
 * If it's a function signature, compute the selector.
 */
export function normalizeFormatKey(key: string): string {
  if (isSelector(key)) {
    return key.toLowerCase();
  }
  return computeSelector(key).toLowerCase();
}

// ── Index building ──────────────────────────────────────────────────

/**
 * Create a lookup key for the index.
 */
function makeKey(chainId: number, address: string, selector: string): string {
  return `${chainId}:${address.toLowerCase()}:${selector.toLowerCase()}`;
}

/**
 * Extract method name from a function signature.
 * Example: "submit(address)" -> "submit"
 */
function extractMethodName(signature: string): string {
  const parenIndex = signature.indexOf("(");
  return parenIndex === -1 ? signature : signature.substring(0, parenIndex);
}

/**
 * Build an index from a list of ERC-7730 descriptors.
 */
export function buildIndex(
  descriptors: ERC7730Descriptor[]
): DescriptorIndex {
  const entries = new Map<string, IndexEntry>();
  const methodEntries = new Map<string, IndexEntry[]>();

  for (const descriptor of descriptors) {
    // Resolve all $ref and metadata constant references
    const resolved = resolveDescriptor(descriptor);

    // Extract deployments from both contract and eip712 contexts
    const deployments = [
      ...(resolved.context.contract?.deployments ?? []),
      ...(resolved.context.eip712?.deployments ?? []),
    ];

    // Index each format entry for each deployment
    for (const [formatKey, formatEntry] of Object.entries(
      resolved.display.formats
    )) {
      const selector = normalizeFormatKey(formatKey);
      const methodName = extractMethodName(formatKey);

      for (const deployment of deployments) {
        const indexEntry: IndexEntry = {
          descriptor: resolved,
          formatEntry,
          selector,
        };

        // Index by selector
        const key = makeKey(
          deployment.chainId,
          deployment.address,
          selector
        );

        // First descriptor wins (allows for override semantics)
        if (!entries.has(key)) {
          entries.set(key, indexEntry);
        }

        // Also index by method name for when we only have the method name
        const methodKey = makeKey(
          deployment.chainId,
          deployment.address,
          methodName.toLowerCase()
        );

        if (!methodEntries.has(methodKey)) {
          methodEntries.set(methodKey, []);
        }
        methodEntries.get(methodKey)!.push(indexEntry);
      }
    }
  }

  return {
    entries,
    methodEntries,
    descriptors,
  };
}

/**
 * Lookup a format entry by chainId, address, and selector.
 */
export function lookupFormat(
  index: DescriptorIndex,
  chainId: number,
  address: string,
  selector: string
): IndexEntry | null {
  const key = makeKey(chainId, address, selector);
  return index.entries.get(key) ?? null;
}

/**
 * Lookup a format entry by chainId, address, and function signature.
 */
export function lookupFormatBySignature(
  index: DescriptorIndex,
  chainId: number,
  address: string,
  signature: string
): IndexEntry | null {
  const selector = computeSelector(signature);
  return lookupFormat(index, chainId, address, selector);
}

/**
 * Lookup a format entry by method name (when full signature is not available).
 * Returns the first match if multiple function signatures have the same method name.
 */
export function lookupFormatByMethodName(
  index: DescriptorIndex,
  chainId: number,
  address: string,
  methodName: string
): IndexEntry | null {
  const key = makeKey(chainId, address, methodName.toLowerCase());
  const entries = index.methodEntries.get(key);
  return entries?.[0] ?? null;
}
