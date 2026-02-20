import { describe, it, expect } from "vitest";
import {
  evidencePackageSchema,
  evidenceExportContractSchema,
  consensusProofSchema,
  onchainPolicyProofSchema,
  simulationSchema,
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
      reasons: ["missing-rpc-url", "missing-onchain-policy-proof"],
      artifacts: {
        consensusProof: true,
        onchainPolicyProof: false,
        simulation: false,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("consensus proof network schema", () => {
  it("rejects unsupported consensus networks", () => {
    const result = consensusProofSchema.safeParse({
      checkpoint:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      bootstrap: "{}",
      updates: [],
      finalityUpdate: "{}",
      network: "holesky",
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

  it("rejects simulation with invalid trust level", () => {
    const invalid = { ...MOCK_SIMULATION, trust: "invalid-trust" };
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
