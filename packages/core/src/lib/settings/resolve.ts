import type { SettingsConfig } from "./types";

function getEntryChainIds(entry: { chainIds?: number[] }): number[] | null {
  if (entry.chainIds && entry.chainIds.length > 0) return entry.chainIds;
  return null;
}

function resolveScopedName<T extends { address: string; name: string; chainIds?: number[] }>(
  entries: T[],
  address: string,
  chainId?: number,
): T | null {
  const lower = address.toLowerCase();
  const matching = entries.filter((e) => e.address.toLowerCase() === lower);
  if (matching.length === 0) return null;

  if (typeof chainId !== "number") {
    return matching[0] ?? null;
  }

  const exact = matching.find((entry) => getEntryChainIds(entry)?.includes(chainId));
  if (exact) return exact;

  const global = matching.find((entry) => getEntryChainIds(entry) === null);
  return global ?? null;
}

export function resolveAddress(
  address: string,
  config: SettingsConfig,
  chainId?: number,
): string | null {
  const entry = resolveScopedName(config.addressBook, address, chainId);
  return entry?.name ?? null;
}

export function resolveContract(
  address: string,
  config: SettingsConfig,
  chainId?: number,
): { name: string; abi?: unknown } | null {
  const entry = resolveScopedName(config.contractRegistry, address, chainId);
  if (!entry) return null;
  return { name: entry.name, abi: entry.abi };
}
