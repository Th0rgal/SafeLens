import { describe, it, expect } from "vitest";
import {
  CHAIN_ID_TO_BEACON_NETWORK,
  fetchConsensusProof,
} from "../beacon-api";

describe("consensus beacon network support", () => {
  it("maps only networks currently supported by the desktop verifier", () => {
    expect(CHAIN_ID_TO_BEACON_NETWORK[1]).toBe("mainnet");
    expect(CHAIN_ID_TO_BEACON_NETWORK[11155111]).toBe("sepolia");
    expect(CHAIN_ID_TO_BEACON_NETWORK[100]).toBeUndefined();
  });

  it("fails fast for unsupported chain IDs", async () => {
    await expect(fetchConsensusProof(100)).rejects.toThrow(
      "Consensus proofs are currently supported for Ethereum mainnet (1) and Sepolia (11155111)."
    );
  });
});
