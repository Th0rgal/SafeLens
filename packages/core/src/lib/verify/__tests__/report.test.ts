import { describe, it, expect } from "vitest";
import { verifyEvidencePackage } from "..";
import { createEvidencePackage } from "../../package/creator";
import { COWSWAP_TWAP_TX, CHAIN_ID, TX_URL } from "../../safe/__tests__/fixtures/cowswap-twap-tx";
import type { SettingsConfig } from "../../settings/types";
import type { OnchainPolicyProof, Simulation } from "../../types";
import { VERIFICATION_SOURCE_IDS } from "../../trust/sources";
import type { Address, Hex } from "viem";
import proofFixture from "../../proof/__tests__/fixtures/safe-policy-proof.json";

const VOID_SETTINGS: SettingsConfig = {
  version: "1.0",
  chains: {},
  addressRegistry: [],
  erc7730Descriptors: [],
  disabledInterpreters: [],
};

describe("verifyEvidencePackage", () => {
  it("returns proposer and signature summary for a valid evidence package", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const result = await verifyEvidencePackage(evidence);

    expect(result.proposer).toBe(COWSWAP_TWAP_TX.confirmations[0].owner);
    expect(result.signatures.summary.total).toBe(evidence.confirmations.length);
    expect(result.signatures.summary.valid).toBe(evidence.confirmations.length);
    expect(result.signatures.byOwner[evidence.confirmations[0].owner].status).toBe("valid");
    expect(result.hashMatch).toBe(true);
    expect(result.sources).toHaveLength(10);
    expect(result.sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SETTINGS)?.status).toBe("disabled");
    expect(result.sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SAFE_OWNERS_THRESHOLD)?.trust).toBe("api-sourced");
    expect(result.sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.DECODED_CALLDATA)?.status).toBe("enabled");
    // Without policy proof or simulation, those sections should be disabled
    expect(result.sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.ONCHAIN_POLICY_PROOF)?.status).toBe("disabled");
    expect(result.sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SIMULATION)?.status).toBe("disabled");
  });

  it("detects tampered safeTxHash and still validates signatures against recomputed hash", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const originalHash = evidence.safeTxHash;

    // Tamper the safeTxHash field
    evidence.safeTxHash = "0x" + "aa".repeat(32);

    const result = await verifyEvidencePackage(evidence);

    // hashMatch should be false since we tampered the stored hash
    expect(result.hashMatch).toBe(false);

    // The recomputed hash in hashDetails should match the original
    expect(result.hashDetails?.safeTxHash.toLowerCase()).toBe(
      originalHash.toLowerCase()
    );

    // Signatures should STILL be valid — they are verified against the
    // recomputed hash, not the tampered evidence.safeTxHash
    expect(result.signatures.summary.valid).toBe(evidence.confirmations.length);
    expect(result.signatures.summary.invalid).toBe(0);
  });

  it("returns target warnings when settings are unavailable", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const result = await verifyEvidencePackage(evidence, { settings: VOID_SETTINGS });

    expect(result.targetWarnings).toHaveLength(1);
    expect(result.targetWarnings[0]).toMatchObject({
      level: "danger",
      message: expect.stringContaining("unknown contract"),
    });
    expect(result.sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SETTINGS)?.status).toBe("enabled");
  });

  it("returns no target warnings without settings", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const result = await verifyEvidencePackage(evidence);

    expect(result.targetWarnings).toHaveLength(0);
  });
});

// ── Integration: verifyEvidencePackage with onchainPolicyProof ────

function makeOnchainProof(): OnchainPolicyProof {
  return {
    blockNumber: proofFixture.blockNumber,
    stateRoot: proofFixture.stateRoot as Hex,
    accountProof: {
      address: proofFixture.accountProof.address as Address,
      balance: proofFixture.accountProof.balance,
      codeHash: proofFixture.accountProof.codeHash as Hex,
      nonce: proofFixture.accountProof.nonce,
      storageHash: proofFixture.accountProof.storageHash as Hex,
      accountProof: proofFixture.accountProof.accountProof as Hex[],
      storageProof: proofFixture.accountProof.storageProof.map((sp) => ({
        key: sp.key as Hex,
        value: sp.value as Hex,
        proof: sp.proof as Hex[],
      })),
    },
    decodedPolicy: {
      owners: proofFixture.decodedPolicy.owners as Address[],
      threshold: proofFixture.decodedPolicy.threshold,
      nonce: proofFixture.decodedPolicy.nonce,
      modules: proofFixture.decodedPolicy.modules as Address[],
      guard: proofFixture.decodedPolicy.guard as Address,
      fallbackHandler: proofFixture.decodedPolicy.fallbackHandler as Address,
      singleton: proofFixture.decodedPolicy.singleton as Address,
    },
    trust: "rpc-sourced",
  };
}

describe("verifyEvidencePackage with onchainPolicyProof", () => {
  it("returns policyProof result when evidence contains a valid proof", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.1" as const,
      onchainPolicyProof: makeOnchainProof(),
    };

    const result = await verifyEvidencePackage(enriched);

    // policyProof must be present and valid
    expect(result.policyProof).toBeDefined();
    expect(result.policyProof!.valid).toBe(true);
    expect(result.policyProof!.errors).toHaveLength(0);
    expect(result.policyProof!.checks.length).toBeGreaterThan(0);
    // Every check should pass
    for (const check of result.policyProof!.checks) {
      expect(check.passed).toBe(true);
    }
    // The onchain-policy-proof source should be enabled
    expect(result.sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.ONCHAIN_POLICY_PROOF)?.status).toBe("enabled");
  });

  it("returns policyProof.valid=false when proof is tampered", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const proof = makeOnchainProof();
    // Tamper: claim a different threshold than what the proof proves
    proof.decodedPolicy.threshold = 99;

    const enriched = {
      ...evidence,
      version: "1.1" as const,
      onchainPolicyProof: proof,
    };

    const result = await verifyEvidencePackage(enriched);

    expect(result.policyProof).toBeDefined();
    expect(result.policyProof!.valid).toBe(false);
    const thresholdCheck = result.policyProof!.checks.find((c) => c.id === "threshold");
    expect(thresholdCheck?.passed).toBe(false);
  });

  it("returns policyProof=undefined when evidence has no proof", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const result = await verifyEvidencePackage(evidence);

    expect(result.policyProof).toBeUndefined();
  });

  it("fails when confirmationsRequired does not match proof-verified threshold", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    // Tamper confirmationsRequired to 1 (real threshold is 3)
    evidence.confirmationsRequired = 1;

    const enriched = {
      ...evidence,
      version: "1.1" as const,
      onchainPolicyProof: makeOnchainProof(),
    };

    const result = await verifyEvidencePackage(enriched);

    // The proof's MPT checks pass, but the cross-validation fails
    expect(result.policyProof).toBeDefined();
    expect(result.policyProof!.valid).toBe(false);
    const mismatchCheck = result.policyProof!.checks.find(
      (c) => c.id === "threshold-vs-confirmations"
    );
    expect(mismatchCheck).toBeDefined();
    expect(mismatchCheck!.passed).toBe(false);
    expect(mismatchCheck!.detail).toContain("1");
    expect(mismatchCheck!.detail).toContain("3");
    // Trust should NOT be upgraded to proof-verified
    const proofSource = result.sources.find(
      (s) => s.id === "onchain-policy-proof"
    );
    expect(proofSource?.trust).not.toBe("proof-verified");
  });
});

// ── Simulation helpers ──────────────────────────────────────────────

function makeValidSimulation(): Simulation {
  return {
    success: true,
    returnData: "0x0000000000000000000000000000000000000000000000000000000000000001",
    gasUsed: "151553",
    logs: [],
    blockNumber: 21000000,
    trust: "rpc-sourced",
  };
}

// ── Integration: verifyEvidencePackage with simulation ──────────────

describe("verifyEvidencePackage with simulation", () => {
  it("returns simulationVerification when evidence contains simulation", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.1" as const,
      simulation: makeValidSimulation(),
    };

    const result = await verifyEvidencePackage(enriched);

    expect(result.simulationVerification).toBeDefined();
    expect(result.simulationVerification!.valid).toBe(true);
    expect(result.simulationVerification!.errors).toHaveLength(0);
    expect(result.simulationVerification!.checks.length).toBeGreaterThan(0);
    // The simulation source should be enabled
    expect(result.sources.find((s) => s.id === "simulation")?.status).toBe("enabled");
  });

  it("returns simulationVerification=undefined when evidence has no simulation", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const result = await verifyEvidencePackage(evidence);

    expect(result.simulationVerification).toBeUndefined();
    expect(result.sources.find((s) => s.id === "simulation")?.status).toBe("disabled");
  });
});

// ── Integration: combined onchainPolicyProof + simulation ───────────

describe("verifyEvidencePackage with onchainPolicyProof + simulation", () => {
  it("returns both policyProof and simulationVerification when both are present", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.1" as const,
      onchainPolicyProof: makeOnchainProof(),
      simulation: makeValidSimulation(),
    };

    const result = await verifyEvidencePackage(enriched);

    // Both sections are present
    expect(result.policyProof).toBeDefined();
    expect(result.simulationVerification).toBeDefined();

    // Both are valid
    expect(result.policyProof!.valid).toBe(true);
    expect(result.simulationVerification!.valid).toBe(true);

    // Sources reflect both being enabled
    const proofSource = result.sources.find((s) => s.id === "onchain-policy-proof");
    const simSource = result.sources.find((s) => s.id === "simulation");
    expect(proofSource?.status).toBe("enabled");
    expect(simSource?.status).toBe("enabled");

    // Proof trust should be upgraded to proof-verified after local verification
    expect(proofSource?.trust).toBe("proof-verified");
    // Simulation trust stays rpc-sourced
    expect(simSource?.trust).toBe("rpc-sourced");
  });

  it("handles valid proof + reverted simulation correctly", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const revertedSim = makeValidSimulation();
    revertedSim.success = false;
    revertedSim.returnData = null;
    revertedSim.gasUsed = "0";

    const enriched = {
      ...evidence,
      version: "1.1" as const,
      onchainPolicyProof: makeOnchainProof(),
      simulation: revertedSim,
    };

    const result = await verifyEvidencePackage(enriched);

    // Proof passes
    expect(result.policyProof!.valid).toBe(true);

    // Simulation is structurally valid (no errors) but execution reverted
    expect(result.simulationVerification).toBeDefined();
    expect(result.simulationVerification!.valid).toBe(true); // structural validity
    expect(result.simulationVerification!.executionReverted).toBe(true);
    const execCheck = result.simulationVerification!.checks.find((c) => c.id === "execution-result");
    expect(execCheck?.passed).toBe(false);
    expect(execCheck?.detail).toContain("reverted");
  });
});
