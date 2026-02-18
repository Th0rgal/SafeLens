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
  /** Original ERC-7730 format key (human-readable signature with param names). */
  formatKey: string;
}

export interface DescriptorIndex {
  /** Map from "chainId:address:selector" -> IndexEntry */
  entries: Map<string, IndexEntry>;
  /** Map from "chainId:address:methodName" -> IndexEntry[] (for ambiguous lookups) */
  methodEntries: Map<string, IndexEntry[]>;
  /** All loaded descriptors */
  descriptors: ERC7730Descriptor[];
}

// ── Signature canonicalization ──────────────────────────────────────

/**
 * Canonicalize an ERC-7730 function signature to the ABI-canonical form.
 *
 * ERC-7730 uses human-readable signatures with parameter names and struct
 * variable names that must be stripped before computing the 4-byte selector.
 *
 * Examples:
 *   "transfer(address,uint256)" -> "transfer(address,uint256)" (unchanged)
 *   "create((uint256 salt, uint256 maker) order)" -> "create((uint256,uint256))"
 *   "swap(uint256 amount, address to)" -> "swap(uint256,address)"
 */
export function canonicalizeSignature(sig: string): string {
  const methodEnd = sig.indexOf("(");
  if (methodEnd === -1) return sig;

  const methodName = sig.substring(0, methodEnd);
  const paramsStr = sig.substring(methodEnd);

  // Parse the params, stripping variable names and keeping only types.
  // In ERC-7730 signatures, each parameter is "type [name]" where name is optional.
  // Tuples are "(type1 name1, type2 name2) tupleName" — the tuple itself is the type.
  let result = "";
  let i = 0;
  let tokenStart = -1;
  let lastType = "";
  // After closing a tuple ")", the tuple itself is the type — any following
  // token before "," or ")" is just a variable name to discard.
  let afterTupleClose = false;

  while (i < paramsStr.length) {
    const ch = paramsStr[i];

    if (ch === "(") {
      // Emit any pending type before opening a nested tuple
      if (lastType) {
        result += lastType;
        lastType = "";
      }
      result += ch;
      tokenStart = -1;
      afterTupleClose = false;
    } else if (ch === ")") {
      // Flush pending token as type (if not after a tuple close)
      if (tokenStart !== -1 && !lastType && !afterTupleClose) {
        lastType = paramsStr.substring(tokenStart, i);
      }
      tokenStart = -1;
      if (lastType) {
        result += lastType;
        lastType = "";
      }
      result += ch;
      afterTupleClose = true;
    } else if (ch === ",") {
      // Flush pending token as type (if not after a tuple close)
      if (tokenStart !== -1 && !lastType && !afterTupleClose) {
        lastType = paramsStr.substring(tokenStart, i);
      }
      tokenStart = -1;
      if (lastType) {
        result += lastType;
        lastType = "";
      }
      result += ",";
      afterTupleClose = false;
    } else if (ch === " ") {
      // Space separates type from name — keep the first token (type)
      if (tokenStart !== -1) {
        if (!lastType && !afterTupleClose) {
          lastType = paramsStr.substring(tokenStart, i);
        }
        tokenStart = -1;
      }
    } else {
      if (tokenStart === -1) {
        tokenStart = i;
      }
    }
    i++;
  }

  return methodName + result;
}

// ── Selector computation ────────────────────────────────────────────

/**
 * Compute the 4-byte selector from a function signature.
 * Example: "transfer(address,uint256)" -> "0xa9059cbb"
 */
export function computeSelector(signature: string): string {
  const canonical = canonicalizeSignature(signature);
  const hash = keccak256(toBytes(canonical));
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
          formatKey,
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
