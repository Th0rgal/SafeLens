import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { createEvidencePackage } from "../../package/creator";
import {
  applySimulationReplayVerificationToReport,
  verifyEvidencePackage,
} from "..";
import { VERIFICATION_SOURCE_IDS } from "../../trust/sources";
import { COWSWAP_TWAP_TX, CHAIN_ID, TX_URL } from "../../safe/__tests__/fixtures/cowswap-twap-tx";
import type { OnchainPolicyProof, Simulation, SimulationWitness } from "../../types";
import { computeSimulationDigest } from "../../simulation";
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

function makeSimulation(): Simulation {
  return {
    success: false,
    returnData: "0x",
    gasUsed: "0",
    logs: [],
    blockNumber: proofFixture.blockNumber,
    traceAvailable: true,
    trust: "rpc-sourced",
  };
}

function makeWitness(
  simulation: Simulation,
  overrides: Partial<SimulationWitness> = {}
): SimulationWitness {
  const onchain = makeOnchainProof();
  return {
    chainId: CHAIN_ID,
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

describe("verifyEvidencePackage simulation witness trust handling", () => {
  it("keeps simulation source rpc-sourced when witness artifact is missing", async () => {
    const base = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const simulation = makeSimulation();
    const enriched = {
      ...base,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      simulation,
    };

    const report = await verifyEvidencePackage(enriched);
    expect(report.simulationVerification?.valid).toBe(true);
    expect(report.simulationWitnessVerification).toBeUndefined();
    const simulationSource = report.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.SIMULATION
    );
    expect(simulationSource?.trust).toBe("rpc-sourced");
    expect(simulationSource?.summary).toContain("No simulation witness was included");
  });

  it("keeps simulation source rpc-sourced until local replay verification exists", async () => {
    const base = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const simulation = makeSimulation();
    const enriched = {
      ...base,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      simulation,
      simulationWitness: makeWitness(simulation),
    };

    const report = await verifyEvidencePackage(enriched);
    expect(report.simulationVerification?.valid).toBe(true);
    expect(report.simulationWitnessVerification?.valid).toBe(true);
    const simulationSource = report.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.SIMULATION
    );
    expect(simulationSource?.trust).toBe("rpc-sourced");
    expect(simulationSource?.summary).toContain("local replay was not run");
  });

  it("keeps simulation source rpc-sourced when witness does not align with policy anchor", async () => {
    const base = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const simulation = makeSimulation();
    const enriched = {
      ...base,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      simulation,
      simulationWitness: makeWitness(simulation, {
        stateRoot:
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      }),
    };

    const report = await verifyEvidencePackage(enriched);
    expect(report.simulationVerification?.valid).toBe(true);
    expect(report.simulationWitnessVerification?.valid).toBe(false);
    const simulationSource = report.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.SIMULATION
    );
    expect(simulationSource?.trust).toBe("rpc-sourced");
  });

  it("surfaces replay execution errors deterministically", async () => {
    const base = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const simulation = makeSimulation();
    const enriched = {
      ...base,
      version: "1.2" as const,
      onchainPolicyProof: makeOnchainProof(),
      simulation,
      simulationWitness: makeWitness(simulation),
    };

    const report = await verifyEvidencePackage(enriched);
    const upgraded = applySimulationReplayVerificationToReport(report, enriched, {
      simulationReplayVerification: {
        executed: true,
        success: false,
        reason: "simulation-replay-exec-error",
        error: "local revm replay failed",
      },
    });
    const simulationSource = upgraded.sources.find(
      (source) => source.id === VERIFICATION_SOURCE_IDS.SIMULATION
    );
    expect(simulationSource?.trust).toBe("rpc-sourced");
    expect(simulationSource?.summary).toContain("Local replay execution failed");
  });
});
