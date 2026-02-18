import type { SettingsConfig } from "./types";

function getEntryChainIds(entry: { chainIds?: number[] }): number[] | null {
  if (entry.chainIds && entry.chainIds.length > 0) return entry.chainIds;
  return null;
}

function resolveScopedName<T extends { address: string; name: string; kind: "eoa" | "contract"; chainIds?: number[] }>(
  entries: T[],
  address: string,
  chainId?: number,
  kind?: "eoa" | "contract",
): T | null {
  const lower = address.toLowerCase();
  const matching = entries.filter((e) => e.address.toLowerCase() === lower && (!kind || e.kind === kind));
  if (matching.length === 0) return null;

  if (typeof chainId !== "number") {
    return matching[0] ?? null;
  }

  const exact = matching.find((entry) => getEntryChainIds(entry)?.includes(chainId));
  if (exact) return exact;

  const global = matching.find((entry) => getEntryChainIds(entry) === null);
  return global ?? null;
}

/**
 * Resolve an address to a human-readable name from the address book.
 *
 * When `chainId` is provided, prefers an exact chain match, then falls back
 * to "all chains" entries (those without chainIds). Without `chainId`,
 * matches on address only (backward compatible).
 */
export function resolveAddress(
  address: string,
  config: SettingsConfig,
  chainId?: number,
): string | null {
  const entry = resolveScopedName(config.addressRegistry, address, chainId, "eoa")
    ?? resolveScopedName(config.addressRegistry, address, chainId);
  return entry?.name ?? null;
}

/**
 * Resolve a contract address to a name (and optional ABI) from the registry.
 *
 * Same chain-matching strategy as resolveAddress.
 */
export function resolveContract(
  address: string,
  config: SettingsConfig,
  chainId?: number,
): { name: string; abi?: unknown } | null {
  const entry = resolveScopedName(config.addressRegistry, address, chainId, "contract");
  if (!entry) return null;
  return { name: entry.name, abi: entry.abi };
}
