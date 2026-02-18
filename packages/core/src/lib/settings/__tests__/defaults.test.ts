import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS_CONFIG,
  CLEAR_SIGNING_REGISTRY_COMMIT,
  CLEAR_SIGNING_REGISTRY_URL,
} from "../defaults";
import type { ERC7730Descriptor } from "../../erc7730/types";

function descriptorChainIds(descriptor: ERC7730Descriptor): number[] {
  const ids = new Set<number>();
  for (const deployment of descriptor.context.contract?.deployments ?? []) {
    ids.add(deployment.chainId);
  }
  for (const deployment of descriptor.context.eip712?.deployments ?? []) {
    ids.add(deployment.chainId);
  }
  return Array.from(ids);
}

describe("DEFAULT_SETTINGS_CONFIG", () => {
  it("derives chains from bundled ERC-7730 descriptors", () => {
    const descriptors = DEFAULT_SETTINGS_CONFIG.erc7730Descriptors as unknown as ERC7730Descriptor[];
    const expected = new Set<number>();

    for (const descriptor of descriptors) {
      for (const chainId of descriptorChainIds(descriptor)) {
        expected.add(chainId);
      }
    }

    const actual = new Set(Object.keys(DEFAULT_SETTINGS_CONFIG.chains).map((id) => Number.parseInt(id, 10)));
    expect(actual).toEqual(expected);
  });

  it("builds non-empty address registry with audit metadata", () => {
    expect(DEFAULT_SETTINGS_CONFIG.addressRegistry.length).toBeGreaterThan(0);

    for (const entry of DEFAULT_SETTINGS_CONFIG.addressRegistry) {
      expect(entry.kind).toBe("contract");
      expect(entry.chainIds && entry.chainIds.length > 0).toBe(true);
      expect(entry.note).toContain("Ledger ERC-7730 clear-signing registry");
      expect(entry.note).toContain(CLEAR_SIGNING_REGISTRY_COMMIT);
      expect(entry.sourceUrl).toBe(CLEAR_SIGNING_REGISTRY_URL);
    }
  });

  it("resolves entries chain-correctly in default data", () => {
    const mainnetUsdt = DEFAULT_SETTINGS_CONFIG.addressRegistry.find(
      (e) => e.address.toLowerCase() === "0xdac17f958d2ee523a2206206994597c13d831ec7"
    );
    expect(mainnetUsdt).toBeDefined();
    expect(mainnetUsdt?.chainIds).toContain(1);
    expect(mainnetUsdt?.chainIds).not.toContain(137);
  });
});
