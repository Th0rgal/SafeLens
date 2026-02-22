import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import type { OnchainPolicyProof, Simulation, SimulationWitness } from "../../types";
import {
  computeSimulationDigest,
  verifySimulationWitness,
} from "../witness-verifier";
import proofFixture from "../../proof/__tests__/fixtures/safe-policy-proof.json";

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

function makeSimulation(overrides: Partial<Simulation> = {}): Simulation {
  return {
    success: false,
    returnData: "0x",
    gasUsed: "0",
    logs: [],
    blockNumber: proofFixture.blockNumber,
    traceAvailable: true,
    trust: "rpc-sourced",
    ...overrides,
  };
}

function makeWitness(
  simulation: Simulation,
  overrides: Partial<SimulationWitness> = {}
): SimulationWitness {
  const onchain = makeOnchainProof();
  return {
    chainId: 1,
    safeAddress: onchain.accountProof.address,
    blockNumber: onchain.blockNumber,
    stateRoot: onchain.stateRoot,
    safeAccountProof: onchain.accountProof,
    overriddenSlots: [
      {
        key: "0x0000000000000000000000000000000000000000000000000000000000000003",
        value:
          "0x0000000000000000000000000000000000000000000000000000000000000005",
      },
      {
        key: "0x0000000000000000000000000000000000000000000000000000000000000004",
        value:
          "0x0000000000000000000000000000000000000000000000000000000000000003",
      },
      {
        key: "0x0000000000000000000000000000000000000000000000000000000000000005",
        value:
          "0x000000000000000000000000000000000000000000000000000000000000001c",
      },
    ],
    simulationDigest: computeSimulationDigest(simulation),
    ...overrides,
  };
}

describe("verifySimulationWitness", () => {
  it("verifies a witness anchored to policy proof and matching simulation payload", () => {
    const simulation = makeSimulation();
    const witness = makeWitness(simulation);
    const onchain = makeOnchainProof();

    const result = verifySimulationWitness(simulation, witness, {
      chainId: 1,
      safeAddress: onchain.accountProof.address as Address,
      onchainPolicyProof: onchain,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("fails when simulation digest does not match witness", () => {
    const simulation = makeSimulation();
    const witness = makeWitness(simulation, {
      simulationDigest:
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    });
    const onchain = makeOnchainProof();

    const result = verifySimulationWitness(simulation, witness, {
      chainId: 1,
      safeAddress: onchain.accountProof.address as Address,
      onchainPolicyProof: onchain,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("digest mismatch"))).toBe(
      true
    );
    const digestCheck = result.checks.find(
      (check) => check.id === "simulation-digest"
    );
    expect(digestCheck?.passed).toBe(false);
  });

  it("fails when witness override slot value is not proven", () => {
    const simulation = makeSimulation();
    const witness = makeWitness(simulation, {
      overriddenSlots: [
        {
          key: "0x0000000000000000000000000000000000000000000000000000000000000004",
          value:
            "0x0000000000000000000000000000000000000000000000000000000000000099",
        },
      ],
    });
    const onchain = makeOnchainProof();

    const result = verifySimulationWitness(simulation, witness, {
      chainId: 1,
      safeAddress: onchain.accountProof.address as Address,
      onchainPolicyProof: onchain,
    });

    expect(result.valid).toBe(false);
    const overrideCheck = result.checks.find(
      (check) => check.id === "override-slots"
    );
    expect(overrideCheck?.passed).toBe(false);
    expect(
      result.errors.some((error) => error.includes("Overridden slot value mismatch"))
    ).toBe(true);
  });
});
