import { describe, it, expect } from "vitest";
import { applyConsensusVerificationToReport, verifyEvidencePackage } from "..";
import { createEvidencePackage } from "../../package/creator";
import { COWSWAP_TWAP_TX, CHAIN_ID, TX_URL } from "../../safe/__tests__/fixtures/cowswap-twap-tx";
import type { SettingsConfig } from "../../settings/types";
import type {
  ConsensusProof,
  ExportContractReason,
  OnchainPolicyProof,
  Simulation,
} from "../../types";
import { VERIFICATION_SOURCE_IDS } from "../../trust/sources";
import type { Address, Hex } from "viem";
import proofFixture from "../../proof/__tests__/fixtures/safe-policy-proof.json";

type BeaconConsensusProof = Extract<ConsensusProof, { checkpoint: string }>;
type ExecutionConsensusProof = Extract<ConsensusProof, { proofPayload: string }>;

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

function makeConsensusProof(
  overrides: Partial<BeaconConsensusProof> = {}
): BeaconConsensusProof {
  return {
    consensusMode: "beacon",
    checkpoint:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    bootstrap: "{\"header\":{\"beacon\":{\"slot\":\"0\"}}}",
    updates: [],
    finalityUpdate:
      "{\"finalized_header\":{\"beacon\":{\"slot\":\"12345\"},\"execution\":{\"state_root\":\"0x0\",\"block_number\":\"0\"}}}",
    network: "mainnet",
    stateRoot: makeOnchainProof().stateRoot,
    blockNumber: makeOnchainProof().blockNumber,
    finalizedSlot: 12345,
    ...overrides,
  };
}

function makeExecutionConsensusProof(
  mode: "opstack" | "linea" = "opstack"
): ExecutionConsensusProof {
  const onchainProof = makeOnchainProof();
  const chainId = mode === "opstack" ? 10 : 59144;

  return {
    consensusMode: mode,
    network: mode === "opstack" ? "optimism" : "linea",
    stateRoot: onchainProof.stateRoot,
    blockNumber: onchainProof.blockNumber,
    proofPayload: JSON.stringify({
      schema: "execution-block-header-v1",
      consensusMode: mode,
      chainId,
      blockTag: "finalized",
      block: {
        number: `0x${onchainProof.blockNumber.toString(16)}`,
        hash: `0x${"b".repeat(64)}`,
        parentHash: `0x${"c".repeat(64)}`,
        stateRoot: onchainProof.stateRoot,
        timestamp: "2026-01-01T00:00:00Z",
      },
    }),
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

  it("keeps policy proof valid when consensus proof aligns to same finalized root", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const result = await verifyEvidencePackage(enriched);
    expect(result.policyProof).toBeDefined();
    expect(result.policyProof!.valid).toBe(true);

    const check = result.policyProof!.checks.find(
      (c) => c.id === "consensus-proof-alignment"
    );
    expect(check).toBeDefined();
    expect(check!.passed).toBe(true);
  });

  it("records deterministic trust reason before desktop consensus verification runs", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const result = await verifyEvidencePackage(enriched);
    expect(result.consensusTrustDecisionReason).toBe(
      "missing-or-invalid-consensus-result"
    );
  });

  it("uses prerequisite-missing reason when consensus proof exists without onchain policy proof", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      consensusProof: makeConsensusProof(),
    };

    const result = await verifyEvidencePackage(enriched);
    expect(result.consensusTrustDecisionReason).toBe(
      "missing-consensus-or-policy-proof"
    );
  });

  it("uses explicit feature-flag-disabled reason when consensus proof was intentionally omitted", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      exportContract: {
        mode: "partial" as const,
        status: "partial" as const,
        isFullyVerifiable: false,
        reasons: [
          "consensus-mode-disabled-by-feature-flag",
        ] as ExportContractReason[],
        artifacts: {
          consensusProof: false,
          onchainPolicyProof: false,
          simulation: false,
        },
      },
    };

    const result = await verifyEvidencePackage(enriched);
    expect(result.consensusTrustDecisionReason).toBe(
      "consensus-mode-disabled-by-feature-flag"
    );
    const consensusSource = result.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain(
      "disabled by feature flag"
    );
  });

  it("uses explicit unsupported-consensus-mode reason when consensus proof was omitted", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      exportContract: {
        mode: "partial" as const,
        status: "partial" as const,
        isFullyVerifiable: false,
        reasons: ["unsupported-consensus-mode"] as ExportContractReason[],
        artifacts: {
          consensusProof: false,
          onchainPolicyProof: false,
          simulation: false,
        },
      },
    };

    const result = await verifyEvidencePackage(enriched);
    expect(result.consensusTrustDecisionReason).toBe(
      "unsupported-consensus-mode"
    );
    const consensusSource = result.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain("not supported");
  });

  it("uses explicit consensus-proof-fetch-failed reason when consensus proof fetch failed at export", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      exportContract: {
        mode: "partial" as const,
        status: "partial" as const,
        isFullyVerifiable: false,
        reasons: ["consensus-proof-fetch-failed"] as ExportContractReason[],
        artifacts: {
          consensusProof: false,
          onchainPolicyProof: false,
          simulation: false,
        },
      },
    };

    const result = await verifyEvidencePackage(enriched);
    expect(result.consensusTrustDecisionReason).toBe(
      "consensus-proof-fetch-failed"
    );
    const consensusSource = result.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain("generation failed");
  });

  it("uses explicit OP Stack pending reason before desktop consensus verification runs", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeExecutionConsensusProof("opstack"),
      exportContract: {
        mode: "partial" as const,
        status: "partial" as const,
        isFullyVerifiable: false,
        reasons: ["opstack-consensus-verifier-pending"] as ExportContractReason[],
        artifacts: {
          consensusProof: true,
          onchainPolicyProof: true,
          simulation: false,
        },
      },
    };

    const result = await verifyEvidencePackage(enriched);
    expect(result.consensusTrustDecisionReason).toBe(
      "opstack-consensus-verifier-pending"
    );
    const consensusSource = result.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain("OP Stack envelope checks passed");
  });

  it("allows OP Stack trust upgrade once consensus verification succeeds even if export reasons still include pending", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const onchainProof = makeOnchainProof();
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: onchainProof,
      consensusProof: makeExecutionConsensusProof("opstack"),
      exportContract: {
        mode: "partial" as const,
        status: "partial" as const,
        isFullyVerifiable: false,
        reasons: ["opstack-consensus-verifier-pending"] as ExportContractReason[],
        artifacts: {
          consensusProof: true,
          onchainPolicyProof: true,
          simulation: false,
        },
      },
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: true,
        verified_state_root: onchainProof.stateRoot,
        verified_block_number: onchainProof.blockNumber,
        state_root_matches: true,
        sync_committee_participants: 0,
        error: null,
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBeNull();
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.trust).toBe("consensus-verified-opstack");
  });

  it("allows Linea trust upgrade once consensus verification succeeds even if export reasons still include pending", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, 59144, TX_URL);
    const onchainProof = makeOnchainProof();
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      chainId: 59144,
      onchainPolicyProof: onchainProof,
      consensusProof: makeExecutionConsensusProof("linea"),
      exportContract: {
        mode: "partial" as const,
        status: "partial" as const,
        isFullyVerifiable: false,
        reasons: ["linea-consensus-verifier-pending"] as ExportContractReason[],
        artifacts: {
          consensusProof: true,
          onchainPolicyProof: true,
          simulation: false,
        },
      },
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: true,
        verified_state_root: onchainProof.stateRoot,
        verified_block_number: onchainProof.blockNumber,
        state_root_matches: true,
        sync_committee_participants: 0,
        error: null,
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBeNull();
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.trust).toBe("consensus-verified-linea");
  });

  it("fails policy proof when consensus proof root/block mismatches", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof({
        blockNumber: makeOnchainProof().blockNumber + 1,
      }),
    };

    const result = await verifyEvidencePackage(enriched);
    expect(result.policyProof).toBeDefined();
    expect(result.policyProof!.valid).toBe(false);
    expect(
      result.policyProof!.errors.some((e) =>
        e.includes("does not align with consensusProof")
      )
    ).toBe(true);

    const check = result.policyProof!.checks.find(
      (c) => c.id === "consensus-proof-alignment"
    );
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
  });

  it("upgrades consensus source trust after successful consensus verification", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: true,
        verified_state_root: enriched.onchainPolicyProof.stateRoot,
        verified_block_number: enriched.onchainPolicyProof.blockNumber,
        state_root_matches: true,
        sync_committee_participants: 512,
        error: null,
        checks: [],
      },
    });

    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.trust).toBe("consensus-verified-beacon");
    expect(consensusSource?.summary).toContain("verified against Beacon consensus");
    expect(upgraded.consensusTrustDecisionReason).toBeNull();
  });

  it("keeps consensus source rpc-sourced when consensus verification fails", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root: null,
        verified_block_number: null,
        state_root_matches: false,
        sync_committee_participants: 0,
        error: "BLS verification failed",
        checks: [],
      },
    });

    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.trust).toBe("rpc-sourced");
    expect(consensusSource?.summary).toContain("not yet verified");
    expect(upgraded.consensusTrustDecisionReason).toBe(
      "missing-or-invalid-consensus-result"
    );
  });

  it("uses explicit OP Stack pending reason when envelope checks pass but verifier is pending", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root: enriched.onchainPolicyProof.stateRoot,
        verified_block_number: enriched.onchainPolicyProof.blockNumber,
        state_root_matches: true,
        sync_committee_participants: 0,
        error: "Verifier mode not implemented",
        error_code: "opstack-consensus-verifier-pending",
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBe(
      "opstack-consensus-verifier-pending"
    );
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain(
      "OP Stack envelope checks passed"
    );
  });

  it("uses explicit Linea pending reason when envelope checks pass but verifier is pending", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root: enriched.onchainPolicyProof.stateRoot,
        verified_block_number: enriched.onchainPolicyProof.blockNumber,
        state_root_matches: true,
        sync_committee_participants: 0,
        error: "Verifier mode not implemented",
        error_code: "linea-consensus-verifier-pending",
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBe(
      "linea-consensus-verifier-pending"
    );
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain("Linea envelope checks passed");
  });

  it("keeps consensus source rpc-sourced when verified state root does not match onchain proof", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: true,
        verified_state_root:
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        verified_block_number: enriched.onchainPolicyProof.blockNumber,
        state_root_matches: false,
        sync_committee_participants: 512,
        error: "state root mismatch",
        checks: [],
      },
    });

    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.trust).toBe("rpc-sourced");
    expect(consensusSource?.summary).toContain("not yet verified");
    expect(upgraded.consensusTrustDecisionReason).toBe(
      "state-root-mismatch-flag"
    );
  });

  it("maps explicit state-root-mismatch error code to mismatch trust reason", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root:
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        verified_block_number: enriched.onchainPolicyProof.blockNumber,
        state_root_matches: false,
        sync_committee_participants: 0,
        error: "state root mismatch",
        error_code: "state-root-mismatch",
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBe(
      "state-root-mismatch-flag"
    );
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain("state-root mismatch");
  });

  it("maps explicit stale envelope error code to stale trust reason", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root: enriched.onchainPolicyProof.stateRoot,
        verified_block_number: enriched.onchainPolicyProof.blockNumber,
        state_root_matches: true,
        sync_committee_participants: 0,
        error:
          "Consensus envelope block timestamp is stale relative to package timestamp.",
        error_code: "stale-consensus-envelope",
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBe(
      "stale-consensus-envelope"
    );
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain("stale relative to package time");
  });

  it("maps explicit stale envelope error code to stale trust reason for Linea mode", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, 59144, TX_URL);
    const onchainProof = makeOnchainProof();
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      chainId: 59144,
      onchainPolicyProof: onchainProof,
      consensusProof: makeExecutionConsensusProof("linea"),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root: onchainProof.stateRoot,
        verified_block_number: onchainProof.blockNumber,
        state_root_matches: true,
        sync_committee_participants: 0,
        error:
          "Consensus envelope block timestamp is stale relative to package timestamp.",
        error_code: "stale-consensus-envelope",
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBe(
      "stale-consensus-envelope"
    );
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.trust).toBe("rpc-sourced");
    expect(consensusSource?.summary).toContain("stale relative to package time");
  });

  it("maps explicit non-finalized envelope error code to deterministic trust reason", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root: null,
        verified_block_number: null,
        state_root_matches: false,
        sync_committee_participants: 0,
        error:
          "Non-beacon consensus envelopes must use finalized blocks; got blockTag='latest'.",
        error_code: "non-finalized-consensus-envelope",
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBe(
      "non-finalized-consensus-envelope"
    );
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain(
      "did not use a finalized execution header"
    );
  });

  it("maps explicit invalid-proof-payload error code to deterministic trust reason", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root: null,
        verified_block_number: null,
        state_root_matches: false,
        sync_committee_participants: 0,
        error: "proofPayload.schema is missing or not a string.",
        error_code: "invalid-proof-payload",
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBe("invalid-proof-payload");
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain(
      "payload is malformed or failed integrity validation"
    );
  });

  it("maps explicit beacon payload parse/verification codes to invalid-proof-payload trust reason", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root: null,
        verified_block_number: null,
        state_root_matches: false,
        sync_committee_participants: 0,
        error:
          "Consensus proof payload fields are missing or malformed for beacon verification.",
        error_code: "invalid-checkpoint-hash",
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBe("invalid-proof-payload");
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain(
      "payload is malformed or failed integrity validation"
    );
  });

  it("maps explicit envelope linkage mismatch error codes to invalid-proof-payload trust reason", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root: null,
        verified_block_number: null,
        state_root_matches: false,
        sync_committee_participants: 0,
        error: "Envelope block number does not match package consensusProof.blockNumber.",
        error_code: "envelope-block-number-mismatch",
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBe("invalid-proof-payload");
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain(
      "payload is malformed or failed integrity validation"
    );
  });

  it("maps explicit invalid-expected-state-root error code to deterministic trust reason", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root: null,
        verified_block_number: null,
        state_root_matches: false,
        sync_committee_participants: 0,
        error:
          "Invalid expected state root from onchainPolicyProof.stateRoot: invalid string length",
        error_code: "invalid-expected-state-root",
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBe(
      "invalid-expected-state-root"
    );
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain(
      "state root is invalid and cannot be verified"
    );
  });

  it("maps explicit unsupported-network error code to deterministic trust reason", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root: null,
        verified_block_number: null,
        state_root_matches: false,
        sync_committee_participants: 0,
        error: "Unsupported chainId for OP Stack consensus verification: 42161.",
        error_code: "unsupported-network",
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBe("unsupported-network");
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain(
      "chain is not supported for this consensus mode"
    );
  });

  it("maps explicit envelope-network-mismatch error code to deterministic trust reason", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: false,
        verified_state_root: null,
        verified_block_number: null,
        state_root_matches: false,
        sync_committee_participants: 0,
        error: "Package network metadata mismatch.",
        error_code: "envelope-network-mismatch",
        checks: [],
      },
    });

    expect(upgraded.consensusTrustDecisionReason).toBe(
      "envelope-network-mismatch"
    );
    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.summary).toContain(
      "network metadata does not match expected chain metadata"
    );
  });

  it("keeps consensus source rpc-sourced when verified block number does not match onchain proof", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: true,
        verified_state_root: enriched.onchainPolicyProof.stateRoot,
        verified_block_number: enriched.onchainPolicyProof.blockNumber + 1,
        state_root_matches: true,
        sync_committee_participants: 512,
        error: "block mismatch",
        checks: [],
      },
    });

    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.trust).toBe("rpc-sourced");
    expect(consensusSource?.summary).toContain("not yet verified");
    expect(upgraded.consensusTrustDecisionReason).toBe(
      "block-number-mismatch-policy-proof"
    );
  });

  it("keeps consensus source rpc-sourced when onchain policy proof is missing", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const enriched = {
      ...evidence,
      version: "1.2" as const,
      consensusProof: makeConsensusProof(),
    };

    const baseReport = await verifyEvidencePackage(enriched);
    const upgraded = applyConsensusVerificationToReport(baseReport, enriched, {
      consensusVerification: {
        valid: true,
        verified_state_root: makeOnchainProof().stateRoot,
        verified_block_number: makeOnchainProof().blockNumber,
        state_root_matches: true,
        sync_committee_participants: 512,
        error: null,
        checks: [],
      },
    });

    const consensusSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
    );
    expect(consensusSource?.trust).toBe("rpc-sourced");
    expect(consensusSource?.summary).toContain("not yet verified");
    expect(upgraded.consensusTrustDecisionReason).toBe(
      "missing-consensus-or-policy-proof"
    );
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
