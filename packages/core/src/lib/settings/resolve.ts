import type { SettingsConfig } from "./types";

export function resolveAddress(
  address: string,
  config: SettingsConfig
): string | null {
  const lower = address.toLowerCase();
  const entry = config.addressBook.find(
    (e) => e.address.toLowerCase() === lower
  );
  return entry?.name ?? null;
}

export function resolveContract(
  address: string,
  config: SettingsConfig
): { name: string; abi?: unknown } | null {
  const lower = address.toLowerCase();
  const entry = config.contractRegistry.find(
    (e) => e.address.toLowerCase() === lower
  );
  if (!entry) return null;
  return { name: entry.name, abi: entry.abi };
}
