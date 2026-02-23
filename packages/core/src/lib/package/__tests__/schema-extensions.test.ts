import { describe, it, expect } from "vitest";
import {
  evidencePackageSchema,
  evidenceExportContractSchema,
  consensusProofSchema,
  findLegacyPendingConsensusExportReason,
  getLegacyPendingConsensusExportReasonForMode,
  getExportContractReasonLabel,
  onchainPolicyProofSchema,
  simulationSchema,
  simulationWitnessSchema,
  trustClassificationSchema,
  type EvidencePackage,
  type OnchainPolicyProof,
  type Simulation,
} from "../../types";
import { createEvidencePackage, exportEvidencePackage } from "../creator";
import { parseEvidencePackage, validateEvidencePackage } from "../validator";
import {
  COWSWAP_TWAP_TX,
  CHAIN_ID,
  TX_URL,
} from "../../safe/__tests__/fixtures/cowswap-twap-tx";

function makeValidEvidence(): EvidencePackage {
  return createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
}

const MOCK_POLICY_PROOF: OnchainPolicyProof = {
  blockNumber: 19000000,
  stateRoot:
    "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
  accountProof: {
    address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e",
    balance: "1000000000000000000",
    codeHash:
      "0x1122334411223344112233441122334411223344112233441122334411223344",
    nonce: 5,
    storageHash:
      "0x5566778855667788556677885566778855667788556677885566778855667788",
    accountProof: [
      "0xf90211a0aabbccdd",
      "0xf90211a0eeff0011",
    ],
    storageProof: [
      {
        key: "0x0000000000000000000000000000000000000000000000000000000000000004",
        value:
          "0x0000000000000000000000000000000000000000000000000000000000000003",
        proof: ["0xf90211a011223344"],
      },
    ],
  },
  decodedPolicy: {
    owners: [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ],
    threshold: 2,
    nonce: 42,
    modules: [],
    guard: "0x0000000000000000000000000000000000000000",
    fallbackHandler: "0x0000000000000000000000000000000000000000",
    singleton: "0x4444444444444444444444444444444444444444",
  },
  trust: "proof-verified",
};

const MOCK_SIMULATION: Simulation = {
  success: true,
  returnData: "0x",
  gasUsed: "150000",
  logs: [
    {
      address: "0x1111111111111111111111111111111111111111",
      topics: [
        "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
      ],
      data: "0x00000000000000000000000000000000000000000000000000000000000000ff",
    },
  ],
  stateDiffs: [
    {
      address: "0x1111111111111111111111111111111111111111",
      key: "0x0000000000000000000000000000000000000000000000000000000000000001",
      before:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      after:
        "0x00000000000000000000000000000000000000000000000000000000000000ff",
    },
  ],
  blockNumber: 19000000,
  trust: "rpc-sourced",
};

describe("evidence package schema backward compatibility", () => {
  it("accepts v1.0 packages without optional sections", () => {
    const evidence = makeValidEvidence();
    expect(evidence.version).toBe("1.0");
    expect(evidence.onchainPolicyProof).toBeUndefined();
    expect(evidence.simulation).toBeUndefined();

    const result = validateEvidencePackage(evidence);
    expect(result.valid).toBe(true);
  });

  it("accepts v1.1 packages with onchainPolicyProof section", () => {
    const evidence = makeValidEvidence();
    const extended = {
      ...evidence,
      version: "1.1" as const,
      onchainPolicyProof: MOCK_POLICY_PROOF,
    };

    const result = evidencePackageSchema.safeParse(extended);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.onchainPolicyProof).toBeDefined();
      expect(result.data.onchainPolicyProof!.trust).toBe("proof-verified");
      expect(result.data.onchainPolicyProof!.decodedPolicy.owners).toHaveLength(3);
      expect(result.data.onchainPolicyProof!.decodedPolicy.threshold).toBe(2);
    }
  });

  it("accepts v1.1 packages with simulation section", () => {
    const evidence = makeValidEvidence();
    const extended = {
      ...evidence,
      version: "1.1" as const,
      simulation: MOCK_SIMULATION,
    };

    const result = evidencePackageSchema.safeParse(extended);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.simulation).toBeDefined();
      expect(result.data.simulation!.trust).toBe("rpc-sourced");
      expect(result.data.simulation!.success).toBe(true);
      expect(result.data.simulation!.logs).toHaveLength(1);
    }
  });

  it("accepts v1.1 packages with both sections", () => {
    const evidence = makeValidEvidence();
    const extended = {
      ...evidence,
      version: "1.1" as const,
      onchainPolicyProof: MOCK_POLICY_PROOF,
      simulation: MOCK_SIMULATION,
    };

    const result = evidencePackageSchema.safeParse(extended);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.onchainPolicyProof).toBeDefined();
      expect(result.data.simulation).toBeDefined();
    }
  });

  it("round-trips v1.1 package with both sections through JSON", () => {
    const evidence = makeValidEvidence();
    const extended: EvidencePackage = {
      ...evidence,
      version: "1.1",
      onchainPolicyProof: MOCK_POLICY_PROOF,
      simulation: MOCK_SIMULATION,
    };

    const json = JSON.stringify(extended, null, 2);
    const parsed = JSON.parse(json);
    const result = evidencePackageSchema.safeParse(parsed);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.onchainPolicyProof!.decodedPolicy.owners).toEqual(
        MOCK_POLICY_PROOF.decodedPolicy.owners
      );
      expect(result.data.simulation!.logs).toEqual(MOCK_SIMULATION.logs);
    }
  });
});

describe("trust classification schema", () => {
  it("accepts all valid trust levels", () => {
    const levels = [
      "consensus-verified",
      "consensus-verified-beacon",
      "consensus-verified-opstack",
      "consensus-verified-linea",
      "proof-verified",
      "self-verified",
      "rpc-sourced",
      "api-sourced",
      "user-provided",
    ];
    for (const level of levels) {
      expect(trustClassificationSchema.safeParse(level).success).toBe(true);
    }
  });

  it("rejects invalid trust levels", () => {
    expect(trustClassificationSchema.safeParse("unknown").success).toBe(false);
    expect(trustClassificationSchema.safeParse("").success).toBe(false);
    expect(trustClassificationSchema.safeParse(123).success).toBe(false);
  });
});

describe("export contract schema", () => {
  it("accepts a fully verifiable contract", () => {
    const result = evidenceExportContractSchema.safeParse({
      mode: "fully-verifiable",
      status: "complete",
      isFullyVerifiable: true,
      reasons: [],
      artifacts: {
        consensusProof: true,
        onchainPolicyProof: true,
        simulation: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a partial contract with machine-readable reasons", () => {
    const result = evidenceExportContractSchema.safeParse({
      mode: "partial",
      status: "partial",
      isFullyVerifiable: false,
      reasons: [
        "missing-rpc-url",
        "missing-onchain-policy-proof",
        "unsupported-consensus-mode",
      ],
      artifacts: {
        consensusProof: true,
        onchainPolicyProof: false,
        simulation: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts mode-specific pending verifier reasons", () => {
    const result = evidenceExportContractSchema.safeParse({
      mode: "partial",
      status: "partial",
      isFullyVerifiable: false,
      reasons: [
        "opstack-consensus-verifier-pending",
        "linea-consensus-verifier-pending",
      ],
      artifacts: {
        consensusProof: true,
        onchainPolicyProof: true,
        simulation: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts feature-flag-disabled consensus reason", () => {
    const result = evidenceExportContractSchema.safeParse({
      mode: "partial",
      status: "partial",
      isFullyVerifiable: false,
      reasons: ["consensus-mode-disabled-by-feature-flag"],
      artifacts: {
        consensusProof: false,
        onchainPolicyProof: true,
        simulation: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it("finds only legacy pending consensus export reasons", () => {
    expect(
      findLegacyPendingConsensusExportReason([
        "missing-simulation",
        "opstack-consensus-verifier-pending",
      ])
    ).toBe("opstack-consensus-verifier-pending");

    expect(
      findLegacyPendingConsensusExportReason([
        "linea-consensus-verifier-pending",
        "missing-consensus-proof",
      ])
    ).toBe("linea-consensus-verifier-pending");

    expect(
      findLegacyPendingConsensusExportReason([
        "missing-consensus-proof",
        "simulation-fetch-failed",
      ])
    ).toBeNull();
    expect(findLegacyPendingConsensusExportReason([])).toBeNull();
    expect(findLegacyPendingConsensusExportReason(undefined)).toBeNull();
  });

  it("maps consensus mode to legacy pending export reason", () => {
    expect(
      getLegacyPendingConsensusExportReasonForMode("opstack")
    ).toBe("opstack-consensus-verifier-pending");
    expect(
      getLegacyPendingConsensusExportReasonForMode("linea")
    ).toBe("linea-consensus-verifier-pending");
    expect(getLegacyPendingConsensusExportReasonForMode("beacon")).toBeNull();
    expect(getLegacyPendingConsensusExportReasonForMode(undefined)).toBeNull();
  });

  it("returns a non-empty label for every export reason", () => {
    const reasons = [
      "missing-consensus-proof",
      "unsupported-consensus-mode",
      "consensus-mode-disabled-by-feature-flag",
      "opstack-consensus-verifier-pending",
      "linea-consensus-verifier-pending",
      "missing-onchain-policy-proof",
      "missing-rpc-url",
      "consensus-proof-fetch-failed",
      "policy-proof-fetch-failed",
      "simulation-fetch-failed",
      "missing-simulation",
      "missing-simulation-witness",
    ] as const;

    for (const reason of reasons) {
      expect(getExportContractReasonLabel(reason).trim().length).toBeGreaterThan(0);
    }
  });
});

describe("consensus proof network schema", () => {
  it("accepts known consensus modes", () => {
    const result = consensusProofSchema.safeParse({
      consensusMode: "beacon",
      checkpoint:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      bootstrap: "{}",
      updates: [],
      finalityUpdate: "{}",
      network: "mainnet",
      stateRoot:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      blockNumber: 1,
      finalizedSlot: 1,
    });
    expect(result.success).toBe(true);
  });

  it("accepts non-beacon consensus envelope for opstack", () => {
    const result = consensusProofSchema.safeParse({
      consensusMode: "opstack",
      network: "base",
      proofPayload: "{\"version\":\"0.1\"}",
      stateRoot:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      blockNumber: 1,
    });
    expect(result.success).toBe(true);
  });

  it("accepts non-beacon consensus envelope for linea", () => {
    const result = consensusProofSchema.safeParse({
      consensusMode: "linea",
      network: "linea",
      proofPayload: "{\"version\":\"0.1\"}",
      stateRoot:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      blockNumber: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unsupported consensus modes", () => {
    const result = consensusProofSchema.safeParse({
      consensusMode: "unknown",
      checkpoint:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      bootstrap: "{}",
      updates: [],
      finalityUpdate: "{}",
      network: "mainnet",
      stateRoot:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      blockNumber: 1,
      finalizedSlot: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-beacon consensus envelope without proof payload", () => {
    const result = consensusProofSchema.safeParse({
      consensusMode: "opstack",
      network: "base",
      stateRoot:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      blockNumber: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unsupported consensus networks", () => {
    const result = consensusProofSchema.safeParse({
      checkpoint:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      bootstrap: "{}",
      updates: [],
      finalityUpdate: "{}",
      network: "polygon",
      stateRoot:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      blockNumber: 1,
      finalizedSlot: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("onchain policy proof schema", () => {
  it("validates a complete policy proof", () => {
    const result = onchainPolicyProofSchema.safeParse(MOCK_POLICY_PROOF);
    expect(result.success).toBe(true);
  });

  it("accepts compact storage slot keys and values from eth_getProof", () => {
    const compact = {
      ...MOCK_POLICY_PROOF,
      accountProof: {
        ...MOCK_POLICY_PROOF.accountProof,
        storageProof: [
          {
            ...MOCK_POLICY_PROOF.accountProof.storageProof[0],
            key: "0x4",
            value: "0x2",
          },
        ],
      },
    };

    expect(onchainPolicyProofSchema.safeParse(compact).success).toBe(true);
  });

  it("rejects policy proof missing required fields", () => {
    const incomplete = { ...MOCK_POLICY_PROOF };
    delete (incomplete as Record<string, unknown>).decodedPolicy;
    expect(onchainPolicyProofSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects policy proof with invalid trust level", () => {
    const invalid = { ...MOCK_POLICY_PROOF, trust: "unknown" };
    expect(onchainPolicyProofSchema.safeParse(invalid).success).toBe(false);
  });

  it("validates decoded policy with all Safe configuration fields", () => {
    const result = onchainPolicyProofSchema.safeParse(MOCK_POLICY_PROOF);
    expect(result.success).toBe(true);
    if (result.success) {
      const policy = result.data.decodedPolicy;
      expect(policy.owners).toHaveLength(3);
      expect(policy.threshold).toBe(2);
      expect(policy.nonce).toBe(42);
      expect(policy.modules).toHaveLength(0);
      expect(policy.guard).toBe("0x0000000000000000000000000000000000000000");
      expect(policy.fallbackHandler).toBe("0x0000000000000000000000000000000000000000");
      expect(policy.singleton).toBe("0x4444444444444444444444444444444444444444");
    }
  });
});

describe("simulation schema", () => {
  it("validates a complete simulation result", () => {
    const result = simulationSchema.safeParse(MOCK_SIMULATION);
    expect(result.success).toBe(true);
  });

  it("accepts simulation without optional stateDiffs", () => {
    const { stateDiffs, ...withoutDiffs } = MOCK_SIMULATION;
    const result = simulationSchema.safeParse(withoutDiffs);
    expect(result.success).toBe(true);
  });

  it("accepts simulation with null returnData", () => {
    const sim = { ...MOCK_SIMULATION, returnData: null };
    const result = simulationSchema.safeParse(sim);
    expect(result.success).toBe(true);
  });

  it("accepts simulation with RFC3339 block timestamp", () => {
    const sim = {
      ...MOCK_SIMULATION,
      blockTimestamp: "2026-02-20T13:55:00.000Z",
    };
    const result = simulationSchema.safeParse(sim);
    expect(result.success).toBe(true);
  });

  it("rejects simulation with invalid trust level", () => {
    const invalid = { ...MOCK_SIMULATION, trust: "invalid-trust" };
    expect(simulationSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects simulation with invalid gas quantity", () => {
    const invalid = { ...MOCK_SIMULATION, gasUsed: "not-a-quantity" };
    expect(simulationSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects simulation with uppercase-0X gas quantity", () => {
    const invalid = { ...MOCK_SIMULATION, gasUsed: "0X5208" };
    expect(simulationSchema.safeParse(invalid).success).toBe(false);
  });

  it("validates simulation log structure", () => {
    const result = simulationSchema.safeParse(MOCK_SIMULATION);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.logs[0].address).toBe(
        "0x1111111111111111111111111111111111111111"
      );
      expect(result.data.logs[0].topics).toHaveLength(1);
    }
  });
});

describe("simulation witness schema", () => {
  it("preserves replay world-state fields for local replay verification", () => {
    const witness = {
      chainId: 1,
      safeAddress: "0x9fC3dc011b461664c835F2527fffb1169b3C213e",
      blockNumber: 19000000,
      stateRoot:
        "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
      safeAccountProof: MOCK_POLICY_PROOF.accountProof,
      overriddenSlots: [
        {
          key: "0x0000000000000000000000000000000000000000000000000000000000000004",
          value:
            "0x0000000000000000000000000000000000000000000000000000000000000002",
        },
      ],
      simulationDigest:
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      replayAccounts: [
        {
          address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e",
          balance: "1",
          nonce: 0,
          code: "0x",
          storage: {
            "0x0000000000000000000000000000000000000000000000000000000000000004":
              "0x0000000000000000000000000000000000000000000000000000000000000002",
          },
        },
      ],
      replayCaller: "0x1111111111111111111111111111111111111111",
      replayGasLimit: 3000000,
    };

    const result = simulationWitnessSchema.safeParse(witness);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.replayAccounts).toHaveLength(1);
      expect(result.data.replayAccounts?.[0]?.storage).toHaveProperty(
        "0x0000000000000000000000000000000000000000000000000000000000000004"
      );
      expect(result.data.replayCaller).toBe(witness.replayCaller);
      expect(result.data.replayGasLimit).toBe(3000000);
    }
  });

  it("rejects replay account balances that are not numeric quantities", () => {
    const witness = {
      chainId: 1,
      safeAddress: "0x9fC3dc011b461664c835F2527fffb1169b3C213e",
      blockNumber: 19000000,
      stateRoot:
        "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
      safeAccountProof: MOCK_POLICY_PROOF.accountProof,
      overriddenSlots: [],
      simulationDigest:
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      replayAccounts: [
        {
          address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e",
          balance: "one-eth",
          nonce: 0,
          code: "0x",
          storage: {},
        },
      ],
    };

    expect(simulationWitnessSchema.safeParse(witness).success).toBe(false);
  });

  it("rejects replay account balances with uppercase-0X prefix", () => {
    const witness = {
      chainId: 1,
      safeAddress: "0x9fC3dc011b461664c835F2527fffb1169b3C213e",
      blockNumber: 19000000,
      stateRoot:
        "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
      safeAccountProof: MOCK_POLICY_PROOF.accountProof,
      overriddenSlots: [],
      simulationDigest:
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      replayAccounts: [
        {
          address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e",
          balance: "0X1",
          nonce: 0,
          code: "0x",
          storage: {},
        },
      ],
    };

    expect(simulationWitnessSchema.safeParse(witness).success).toBe(false);
  });
});
