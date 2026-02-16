/**
 * Global ERC-7730 descriptor index.
 *
 * This is a singleton that loads all bundled descriptors once and provides
 * a ready-to-use index for the interpreter.
 */

import { buildIndex } from "./index";
import type { DescriptorIndex } from "./index";
import { parseDescriptor } from "./parser";
import { bundledDescriptors } from "./descriptors/index";

let globalIndex: DescriptorIndex | null = null;

/**
 * Get or create the global ERC-7730 descriptor index.
 */
export function getGlobalIndex(): DescriptorIndex {
  if (!globalIndex) {
    // Parse all bundled descriptors
    const descriptors = bundledDescriptors
      .map((json) => {
        const result = parseDescriptor(json);
        if (!result.success) {
          console.warn("Failed to parse descriptor:", result.error);
          return null;
        }
        return result.descriptor;
      })
      .filter((d) => d !== null);

    // Build the index
    globalIndex = buildIndex(descriptors);
  }

  return globalIndex;
}

/**
 * Set the global descriptors from raw (unparsed) JSON objects.
 * Parses each descriptor and rebuilds the global index.
 */
export function setGlobalDescriptors(rawDescriptors: unknown[]): void {
  const descriptors = rawDescriptors
    .map((json) => {
      const result = parseDescriptor(json);
      if (!result.success) {
        console.warn("Failed to parse descriptor:", result.error);
        return null;
      }
      return result.descriptor;
    })
    .filter((d) => d !== null);

  globalIndex = buildIndex(descriptors);
}

/**
 * Reset the global index (useful for testing or after importing new descriptors).
 */
export function resetGlobalIndex(): void {
  globalIndex = null;
}
