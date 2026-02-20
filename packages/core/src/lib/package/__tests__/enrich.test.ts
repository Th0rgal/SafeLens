import { describe, it, expect } from "vitest";
import { createEvidencePackage, enrichWithOnchainProof, enrichWithSimulation } from "../creator";
import { evidencePackageSchema } from "../../types";
import {
  COWSWAP_TWAP_TX,
  CHAIN_ID,
  TX_URL,
} from "../../safe/__tests__/fixtures/cowswap-twap-tx";
import { itLiveRpc } from "../../__tests__/live-rpc";

describe("enrichWithOnchainProof", () => {
  it("returns v1.0 package unchanged when no rpcUrl is passed (control)", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    expect(evidence.version).toBe("1.0");
    expect(evidence.onchainPolicyProof).toBeUndefined();
  });

  itLiveRpc("bumps version to 1.1 and attaches onchainPolicyProof", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = await enrichWithOnchainProof(evidence);

    expect(enriched.version).toBe("1.1");
    expect(enriched.onchainPolicyProof).toBeDefined();
    expect(enriched.onchainPolicyProof!.trust).toBe("rpc-sourced");
    expect(enriched.onchainPolicyProof!.blockNumber).toBeGreaterThan(0);
    expect(enriched.onchainPolicyProof!.decodedPolicy.owners.length).toBeGreaterThan(0);
    expect(enriched.onchainPolicyProof!.decodedPolicy.threshold).toBeGreaterThan(0);

    // Validate the enriched package against the Zod schema
    const result = evidencePackageSchema.safeParse(enriched);
    expect(result.success).toBe(true);
  }, 60_000); // 60s timeout for RPC calls

  itLiveRpc("preserves all original evidence fields after enrichment", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = await enrichWithOnchainProof(evidence);

    // All original fields should be preserved
    expect(enriched.safeAddress).toBe(evidence.safeAddress);
    expect(enriched.safeTxHash).toBe(evidence.safeTxHash);
    expect(enriched.chainId).toBe(evidence.chainId);
    expect(enriched.transaction).toEqual(evidence.transaction);
    expect(enriched.confirmations).toEqual(evidence.confirmations);
    expect(enriched.confirmationsRequired).toBe(evidence.confirmationsRequired);
    expect(enriched.sources).toEqual(evidence.sources);
  }, 60_000);
});

describe("enrichWithSimulation", () => {
  itLiveRpc("bumps version to 1.1 and attaches simulation", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = await enrichWithSimulation(evidence);

    expect(enriched.version).toBe("1.1");
    expect(enriched.simulation).toBeDefined();
    expect(enriched.simulation!.trust).toBe("rpc-sourced");
    expect(enriched.simulation!.blockNumber).toBeGreaterThan(0);
    expect(typeof enriched.simulation!.success).toBe("boolean");
    expect(typeof enriched.simulation!.gasUsed).toBe("string");

    // Validate the enriched package against the Zod schema
    const result = evidencePackageSchema.safeParse(enriched);
    expect(result.success).toBe(true);
  }, 60_000);

  itLiveRpc("preserves all original evidence fields after simulation enrichment", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = await enrichWithSimulation(evidence);

    expect(enriched.safeAddress).toBe(evidence.safeAddress);
    expect(enriched.safeTxHash).toBe(evidence.safeTxHash);
    expect(enriched.chainId).toBe(evidence.chainId);
    expect(enriched.transaction).toEqual(evidence.transaction);
    expect(enriched.confirmations).toEqual(evidence.confirmations);
    expect(enriched.confirmationsRequired).toBe(evidence.confirmationsRequired);
    expect(enriched.sources).toEqual(evidence.sources);
  }, 60_000);
});
