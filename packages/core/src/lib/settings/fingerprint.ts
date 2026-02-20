import type { SettingsConfig } from "./types";

/**
 * Deep-sort object keys for deterministic JSON serialization.
 * Arrays preserve order; object keys are sorted alphabetically.
 */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

/**
 * Compute a SHA-256 fingerprint of the settings config.
 * Keys are sorted at every nesting level for determinism.
 * Returns the full hex hash string.
 */
export async function computeConfigFingerprint(
  config: SettingsConfig
): Promise<string> {
  const canonical = JSON.stringify(config, sortedReplacer);
  const data = new TextEncoder().encode(canonical);
  // In browsers, globalThis.crypto.subtle is always available.
  // In Node.js/vitest, globalThis.crypto may be undefined in worker
  // threads. We lazily require node:crypto as a fallback. We use a
  // variable-based require so webpack doesn't try to resolve it
  // (which would fail in browser bundles).
  let subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = "node:crypto";
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { webcrypto } = require(nodeCrypto) as typeof import("node:crypto");
    subtle = (webcrypto as unknown as Crypto).subtle;
  }
  const hashBuffer = await subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derive a deterministic HSL color from a hex hash string.
 * Uses fixed saturation/lightness to ensure visibility on dark backgrounds.
 */
export function colorFromHash(hash: string): string {
  const hue = (parseInt(hash.slice(0, 2), 16) / 255) * 360;
  return `hsl(${Math.round(hue)}, 65%, 55%)`;
}
