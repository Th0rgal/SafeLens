import { describe, it, expect } from "vitest";
import { fetchOnchainPolicyProof } from "../fetcher";
import { onchainPolicyProofSchema } from "../../types";
import { verifyPolicyProof } from "../verify-policy";
import type { Address } from "viem";

const SAFE_ADDRESS = "0x9fC3dc011b461664c835F2527fffb1169b3C213e" as Address;

describe("fetchOnchainPolicyProof", () => {
  it("rejects unsupported chain IDs", async () => {
    await expect(
      fetchOnchainPolicyProof(SAFE_ADDRESS, 999999)
    ).rejects.toThrow("Unsupported chain ID");
  });

  it("fetches a valid proof from mainnet and passes Zod validation", async () => {
    let proof;
    try {
      proof = await fetchOnchainPolicyProof(SAFE_ADDRESS, 1);
    } catch (err) {
      console.warn("Skipping live RPC test:", err);
      return;
    }

    // Zod schema validation
    const result = onchainPolicyProofSchema.safeParse(proof);
    expect(result.success).toBe(true);

    // Structural checks
    expect(proof.blockNumber).toBeGreaterThan(0);
    expect(proof.stateRoot).toMatch(/^0x[a-f0-9]{64}$/);
    expect(proof.trust).toBe("rpc-sourced");

    // This Safe has 5 owners and threshold 3
    expect(proof.decodedPolicy.owners).toHaveLength(5);
    expect(proof.decodedPolicy.threshold).toBe(3);
    expect(proof.decodedPolicy.modules).toHaveLength(0);
    expect(proof.decodedPolicy.guard).toBe(
      "0x0000000000000000000000000000000000000000"
    );
  }, 120_000);

  it("fetched proof passes full cryptographic verification", async () => {
    let proof;
    try {
      proof = await fetchOnchainPolicyProof(SAFE_ADDRESS, 1);
    } catch (err) {
      console.warn("Skipping live RPC test:", err);
      return;
    }

    // Run the full MPT proof verification
    const result = verifyPolicyProof(proof, SAFE_ADDRESS);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    // All checks should pass
    for (const check of result.checks) {
      expect(check.passed).toBe(true);
    }

    // Should have at least these check IDs
    const checkIds = result.checks.map((c) => c.id);
    expect(checkIds).toContain("account-proof");
    expect(checkIds).toContain("storage-proofs");
    expect(checkIds).toContain("singleton");
    expect(checkIds).toContain("threshold");
    expect(checkIds).toContain("nonce");
    expect(checkIds).toContain("owner-count");
    expect(checkIds).toContain("owners-linked-list");
    expect(checkIds).toContain("guard");
    expect(checkIds).toContain("fallback-handler");
    expect(checkIds).toContain("modules-linked-list");
  }, 120_000);

  it("accepts a custom RPC URL", async () => {
    let proof;
    try {
      proof = await fetchOnchainPolicyProof(SAFE_ADDRESS, 1, {
        rpcUrl: "https://ethereum-rpc.publicnode.com",
      });
    } catch (err) {
      console.warn("Skipping live RPC test:", err);
      return;
    }

    expect(proof.blockNumber).toBeGreaterThan(0);
    expect(proof.decodedPolicy.owners).toHaveLength(5);
  }, 120_000);
});
