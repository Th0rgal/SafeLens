import { describe, it, expect } from "vitest";
import { __internal } from "..";
import type { EvidencePackage, ConsensusProof, OnchainPolicyProof } from "../../types";
import type { SimulationWitnessVerificationResult } from "../../simulation";
import type {
  ConsensusVerificationResult,
  SimulationReplayVerificationResult,
} from "..";

const { evaluateConsensusTrustDecision, deriveSimulationVerificationReason } = __internal;

// ── Minimal fixture helpers ──────────────────────────────────────

function makeEvidence(overrides: Partial<EvidencePackage> = {}): EvidencePackage {
  return {
    version: "1.0",
    safeAddress: "0x0000000000000000000000000000000000000001",
    chainId: 1,
    safeTxHash: "0x00",
    confirmationsRequired: 1,
    confirmations: [],
    transaction: {
      to: "0x0000000000000000000000000000000000000002",
      value: "0",
      data: "0x",
      operation: 0,
      nonce: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: "0x0000000000000000000000000000000000000000",
      refundReceiver: "0x0000000000000000000000000000000000000000",
    },
    ...overrides,
  } as EvidencePackage;
}

function makeConsensusVerification(
  overrides: Partial<ConsensusVerificationResult> = {}
): ConsensusVerificationResult {
  return {
    valid: true,
    verified_state_root: "0xabcd",
    verified_block_number: 100,
    state_root_matches: true,
    sync_committee_participants: 512,
    error: null,
    checks: [],
    ...overrides,
  };
}

const MATCHING_STATE_ROOT = "0xabcd";
const MATCHING_BLOCK = 100;

function makeOnchainPolicyProof(overrides: Partial<OnchainPolicyProof> = {}): OnchainPolicyProof {
  return {
    stateRoot: MATCHING_STATE_ROOT,
    blockNumber: MATCHING_BLOCK,
    trust: "rpc-sourced",
    accountProof: [],
    storageProofs: {},
    ...overrides,
  } as OnchainPolicyProof;
}

function makeConsensusProof(overrides: Partial<ConsensusProof> = {}): ConsensusProof {
  return {
    consensusMode: "beacon",
    checkpoint: "0x00" as `0x${string}`,
    bootstrap: "{}",
    updates: [],
    finalityUpdate: "{}",
    network: "mainnet",
    stateRoot: MATCHING_STATE_ROOT as `0x${string}`,
    blockNumber: MATCHING_BLOCK,
    ...overrides,
  } as ConsensusProof;
}

// ── evaluateConsensusTrustDecision ───────────────────────────────

describe("evaluateConsensusTrustDecision", () => {
  it("returns trusted when consensus and policy proofs align", () => {
    const evidence = makeEvidence({
      consensusProof: makeConsensusProof(),
      onchainPolicyProof: makeOnchainPolicyProof(),
    });
    const result = evaluateConsensusTrustDecision(
      evidence,
      makeConsensusVerification()
    );
    expect(result.trusted).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("returns missing-consensus-or-policy-proof when no consensus proof", () => {
    const evidence = makeEvidence({
      onchainPolicyProof: makeOnchainPolicyProof(),
    });
    const result = evaluateConsensusTrustDecision(evidence);
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe("missing-consensus-or-policy-proof");
  });

  it("returns missing-consensus-or-policy-proof when no policy proof", () => {
    const evidence = makeEvidence({
      consensusProof: makeConsensusProof(),
    });
    const result = evaluateConsensusTrustDecision(evidence);
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe("missing-consensus-or-policy-proof");
  });

  it("returns missing-or-invalid-consensus-result when verification not provided", () => {
    const evidence = makeEvidence({
      consensusProof: makeConsensusProof(),
      onchainPolicyProof: makeOnchainPolicyProof(),
    });
    const result = evaluateConsensusTrustDecision(evidence, undefined);
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe("missing-or-invalid-consensus-result");
  });

  it("returns missing-or-invalid-consensus-result when verification invalid", () => {
    const evidence = makeEvidence({
      consensusProof: makeConsensusProof(),
      onchainPolicyProof: makeOnchainPolicyProof(),
    });
    const result = evaluateConsensusTrustDecision(
      evidence,
      makeConsensusVerification({ valid: false })
    );
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe("missing-or-invalid-consensus-result");
  });

  it("returns state-root-mismatch-flag when state_root_matches is false", () => {
    const evidence = makeEvidence({
      consensusProof: makeConsensusProof(),
      onchainPolicyProof: makeOnchainPolicyProof(),
    });
    const result = evaluateConsensusTrustDecision(
      evidence,
      makeConsensusVerification({
        state_root_matches: false,
        verified_state_root: "0xdead",
      })
    );
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe("state-root-mismatch-flag");
  });

  it("returns state-root-mismatch-policy-proof when roots don't match", () => {
    const evidence = makeEvidence({
      consensusProof: makeConsensusProof(),
      onchainPolicyProof: makeOnchainPolicyProof({ stateRoot: "0xdifferent" }),
    });
    const result = evaluateConsensusTrustDecision(
      evidence,
      makeConsensusVerification()
    );
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe("state-root-mismatch-policy-proof");
  });

  it("returns block-number-mismatch-policy-proof when blocks don't match", () => {
    const evidence = makeEvidence({
      consensusProof: makeConsensusProof(),
      onchainPolicyProof: makeOnchainPolicyProof({ blockNumber: 999 }),
    });
    const result = evaluateConsensusTrustDecision(
      evidence,
      makeConsensusVerification()
    );
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe("block-number-mismatch-policy-proof");
  });

  it("returns missing-verified-root-or-block when verification has null root", () => {
    const evidence = makeEvidence({
      consensusProof: makeConsensusProof(),
      onchainPolicyProof: makeOnchainPolicyProof(),
    });
    const result = evaluateConsensusTrustDecision(
      evidence,
      makeConsensusVerification({ verified_state_root: null })
    );
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe("missing-verified-root-or-block");
  });

  it("surfaces export reason when consensus proof is missing and reason is known", () => {
    const evidence = makeEvidence({
      exportContract: {
        reasons: ["consensus-proof-fetch-failed" as const],
      },
    } as Partial<EvidencePackage>);
    const result = evaluateConsensusTrustDecision(evidence);
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe("consensus-proof-fetch-failed");
  });
});

// ── deriveSimulationVerificationReason ────────────────────────────

describe("deriveSimulationVerificationReason", () => {
  const baseOptions = {
    evidence: makeEvidence(),
    signatureSummary: { total: 1, valid: 1, invalid: 0, unsupported: 0 },
  };

  it("returns undefined when no simulation", () => {
    const result = deriveSimulationVerificationReason({
      ...baseOptions,
      evidence: makeEvidence({ simulation: undefined }),
    });
    expect(result).toBeUndefined();
  });

  it("returns missing-simulation-witness when no witness", () => {
    const result = deriveSimulationVerificationReason({
      ...baseOptions,
      evidence: makeEvidence({
        simulation: { success: true, returnData: null, gasUsed: "0", logs: [], blockNumber: 1, blockTimestamp: "", trust: "rpc-sourced" },
      }),
    });
    expect(result).toBe("missing-simulation-witness");
  });

  it("returns simulation-witness-proof-failed when witness verification invalid", () => {
    const result = deriveSimulationVerificationReason({
      ...baseOptions,
      evidence: makeEvidence({
        simulation: { success: true, returnData: null, gasUsed: "0", logs: [], blockNumber: 1, blockTimestamp: "", trust: "rpc-sourced" },
        simulationWitness: {} as EvidencePackage["simulationWitness"],
      }),
      simulationWitnessVerification: { valid: false, checks: [], errors: [] } as SimulationWitnessVerificationResult,
    });
    expect(result).toBe("simulation-witness-proof-failed");
  });

  it("returns simulation-replay-not-run when no replay verification", () => {
    const result = deriveSimulationVerificationReason({
      ...baseOptions,
      evidence: makeEvidence({
        simulation: { success: true, returnData: null, gasUsed: "0", logs: [], blockNumber: 1, blockTimestamp: "", trust: "rpc-sourced" },
        simulationWitness: {} as EvidencePackage["simulationWitness"],
      }),
      simulationWitnessVerification: { valid: true, checks: [], errors: [] } as SimulationWitnessVerificationResult,
    });
    expect(result).toBe("simulation-replay-not-run");
  });

  it("propagates replay failure reason when success is false", () => {
    const result = deriveSimulationVerificationReason({
      ...baseOptions,
      evidence: makeEvidence({
        simulation: { success: true, returnData: null, gasUsed: "0", logs: [], blockNumber: 1, blockTimestamp: "", trust: "rpc-sourced" },
        simulationWitness: {} as EvidencePackage["simulationWitness"],
      }),
      simulationWitnessVerification: { valid: true, checks: [], errors: [] } as SimulationWitnessVerificationResult,
      simulationReplayVerification: {
        executed: true,
        success: false,
        reason: "simulation-replay-mismatch-logs",
      } as SimulationReplayVerificationResult,
    });
    expect(result).toBe("simulation-replay-mismatch-logs");
  });

  it("returns simulation-replay-world-state-unproven when replay succeeded", () => {
    const result = deriveSimulationVerificationReason({
      ...baseOptions,
      evidence: makeEvidence({
        simulation: { success: true, returnData: null, gasUsed: "0", logs: [], blockNumber: 1, blockTimestamp: "", trust: "rpc-sourced" },
        simulationWitness: {} as EvidencePackage["simulationWitness"],
      }),
      simulationWitnessVerification: { valid: true, checks: [], errors: [] } as SimulationWitnessVerificationResult,
      simulationReplayVerification: {
        executed: true,
        success: true,
        reason: "simulation-replay-matched",
      } as SimulationReplayVerificationResult,
    });
    expect(result).toBe("simulation-replay-world-state-unproven");
  });
});
