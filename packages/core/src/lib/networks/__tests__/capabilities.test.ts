import { describe, expect, it } from "vitest";
import {
  CONSENSUS_NETWORKS,
  CONSENSUS_SUPPORTED_CHAIN_IDS,
  SAFE_ADDRESS_SEARCH_CHAIN_IDS,
  getNetworkCapability,
  getNetworkCapabilityByPrefix,
} from "../capabilities";

describe("network capability matrix", () => {
  it("uses explicit active chain IDs for generator/CLI discovery", () => {
    expect(SAFE_ADDRESS_SEARCH_CHAIN_IDS).toEqual([1, 11155111, 137, 42161, 10, 100, 8453]);
  });

  it("exposes consensus support only where verification paths exist", () => {
    expect(CONSENSUS_SUPPORTED_CHAIN_IDS).toEqual([1, 11155111, 17000, 560048, 100]);
    expect(CONSENSUS_NETWORKS).toEqual([
      "mainnet",
      "sepolia",
      "holesky",
      "hoodi",
      "gnosis",
    ]);
  });

  it("keeps legacy goerli parsing but marks unsupported enrichment features", () => {
    const goerli = getNetworkCapability(5);
    expect(goerli).not.toBeNull();
    expect(goerli?.chainPrefix).toBe("gor");
    expect(goerli?.supportsOnchainPolicyProof).toBe(false);
    expect(goerli?.supportsSimulation).toBe(false);
    expect(goerli?.enabledInSafeAddressSearch).toBe(false);
  });

  it("maps prefixes back to network capability entries", () => {
    const gnosis = getNetworkCapabilityByPrefix("gno");
    expect(gnosis?.chainId).toBe(100);
    expect(gnosis?.consensus?.network).toBe("gnosis");
  });
});
