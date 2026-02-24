import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ConsensusProof, OnchainPolicyProof } from "../../types";
import { computeSimulationDigest } from "../../simulation/witness-verifier";
import {
  createEvidencePackage,
  enrichWithConsensusProof,
  enrichWithOnchainProof,
  enrichWithSimulation,
  PROOF_ALIGNMENT_ERROR_CODE,
} from "../creator";
import { COWSWAP_TWAP_TX, CHAIN_ID, TX_URL } from "../../safe/__tests__/fixtures/cowswap-twap-tx";

type BeaconConsensusProof = Extract<ConsensusProof, { checkpoint: string }>;

const {
  fetchOnchainPolicyProofMock,
  fetchConsensusProofMock,
  fetchSimulationMock,
  fetchSimulationWitnessMock,
} = vi.hoisted(
  () => ({
    fetchOnchainPolicyProofMock: vi.fn(),
    fetchConsensusProofMock: vi.fn(),
    fetchSimulationMock: vi.fn(),
    fetchSimulationWitnessMock: vi.fn(),
  })
);

vi.mock("../../proof", () => ({
  fetchOnchainPolicyProof: fetchOnchainPolicyProofMock,
}));

vi.mock("../../consensus", () => ({
  fetchConsensusProof: fetchConsensusProofMock,
}));

vi.mock("../../simulation", () => ({
  fetchSimulation: fetchSimulationMock,
  fetchSimulationWitness: fetchSimulationWitnessMock,
}));

function makeOnchainPolicyProof(
  overrides: Partial<OnchainPolicyProof> = {}
): OnchainPolicyProof {
  return {
    blockNumber: 21000000,
    stateRoot:
      "0xa38574512fb60ec85617785cd52c30f918902b355bab53242fbdf3b40b7a1e7e",
    accountProof: {
      address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e",
      balance: "0",
      codeHash:
        "0x1122334411223344112233441122334411223344112233441122334411223344",
      nonce: 1,
      storageHash:
        "0x5566778855667788556677885566778855667788556677885566778855667788",
      accountProof: [],
      storageProof: [],
    },
    decodedPolicy: {
      owners: ["0x1111111111111111111111111111111111111111"],
      threshold: 1,
      nonce: 1,
      modules: [],
      guard: "0x0000000000000000000000000000000000000000",
      fallbackHandler: "0x0000000000000000000000000000000000000000",
      singleton: "0x2222222222222222222222222222222222222222",
    },
    trust: "rpc-sourced",
    ...overrides,
  };
}

function makeConsensusProof(
  overrides: Partial<BeaconConsensusProof> = {}
): BeaconConsensusProof {
  return {
    consensusMode: "beacon",
    checkpoint:
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    bootstrap: "{}",
    updates: [],
    finalityUpdate: "{}",
    network: "mainnet",
    stateRoot:
      "0xa38574512fb60ec85617785cd52c30f918902b355bab53242fbdf3b40b7a1e7e",
    blockNumber: 21000000,
    finalizedSlot: 123456,
    ...overrides,
  };
}

describe("proof alignment in package enrichment", () => {
  beforeEach(() => {
    fetchOnchainPolicyProofMock.mockReset();
    fetchConsensusProofMock.mockReset();
    fetchSimulationMock.mockReset();
    fetchSimulationWitnessMock.mockReset();
  });

  it("rejects consensus enrichment when existing onchain proof is misaligned", async () => {
    fetchConsensusProofMock.mockResolvedValue(
      makeConsensusProof({ blockNumber: 21000001 })
    );

    const evidence = {
      ...createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL),
      version: "1.1" as const,
      onchainPolicyProof: makeOnchainPolicyProof(),
    };

    await expect(enrichWithConsensusProof(evidence)).rejects.toMatchObject({
      name: "ProofAlignmentError",
      code: PROOF_ALIGNMENT_ERROR_CODE,
      onchainBlockNumber: 21000000,
      consensusBlockNumber: 21000001,
    });
  });

  it("rejects onchain enrichment when existing consensus proof is misaligned", async () => {
    fetchOnchainPolicyProofMock.mockResolvedValue(
      makeOnchainPolicyProof({ stateRoot: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" })
    );

    const evidence = {
      ...createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL),
      version: "1.2" as const,
      consensusProof: makeConsensusProof(),
    };

    await expect(enrichWithOnchainProof(evidence)).rejects.toMatchObject({
      name: "ProofAlignmentError",
      code: PROOF_ALIGNMENT_ERROR_CODE,
      onchainStateRoot:
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      consensusStateRoot:
        "0xa38574512fb60ec85617785cd52c30f918902b355bab53242fbdf3b40b7a1e7e",
    });
  });

  it("pins onchain proof fetch to consensus block by default", async () => {
    fetchOnchainPolicyProofMock.mockResolvedValue(
      makeOnchainPolicyProof({ blockNumber: 21000042 })
    );

    const evidence = {
      ...createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL),
      version: "1.2" as const,
      consensusProof: makeConsensusProof({ blockNumber: 21000042 }),
    };

    await enrichWithOnchainProof(evidence, { rpcUrl: "https://rpc.example" });

    expect(fetchOnchainPolicyProofMock).toHaveBeenCalledWith(
      evidence.safeAddress,
      evidence.chainId,
      expect.objectContaining({
        rpcUrl: "https://rpc.example",
        blockNumber: 21000042,
      })
    );
  });

  it("keeps version 1.2 when adding onchain proof after consensus proof", async () => {
    fetchOnchainPolicyProofMock.mockResolvedValue(makeOnchainPolicyProof());

    const evidence = {
      ...createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL),
      version: "1.2" as const,
      consensusProof: makeConsensusProof(),
    };

    const enriched = await enrichWithOnchainProof(evidence, {
      rpcUrl: "https://rpc.example",
    });

    expect(enriched.version).toBe("1.2");
  });

  it("keeps version 1.2 when adding simulation after consensus proof", async () => {
    fetchSimulationMock.mockResolvedValue({
      success: true,
      returnData: "0x",
      gasUsed: "1",
      logs: [],
      blockNumber: 21000000,
      trust: "rpc-sourced",
    });

    const evidence = {
      ...createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL),
      version: "1.2" as const,
      consensusProof: makeConsensusProof(),
    };

    const { evidence: enriched } = await enrichWithSimulation(evidence, {
      rpcUrl: "https://rpc.example",
    });

    expect(enriched.version).toBe("1.2");
  });

  it("enables witness-only simulation only when replay accounts and block context are present", async () => {
    const simulationLog = {
      address: "0x1111111111111111111111111111111111111111",
      topics: [],
      data: "0x",
    };
    fetchSimulationMock.mockResolvedValue({
      success: true,
      returnData: "0x",
      gasUsed: "1",
      logs: [simulationLog],
      blockNumber: 21000000,
      trust: "rpc-sourced",
    });
    fetchSimulationWitnessMock.mockResolvedValue({
      chainId: CHAIN_ID,
      safeAddress: COWSWAP_TWAP_TX.safe,
      blockNumber: 21000000,
      stateRoot:
        "0xa38574512fb60ec85617785cd52c30f918902b355bab53242fbdf3b40b7a1e7e",
      safeAccountProof: {
        address: COWSWAP_TWAP_TX.safe,
        balance: "0",
        nonce: 0,
        codeHash:
          "0x1122334411223344112233441122334411223344112233441122334411223344",
        storageHash:
          "0x5566778855667788556677885566778855667788556677885566778855667788",
        accountProof: [],
        storageProof: [],
      },
      overriddenSlots: [],
      simulationDigest:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      replayBlock: {
        timestamp: "1700000000",
        gasLimit: "30000000",
        baseFeePerGas: "1",
        beneficiary: "0x0000000000000000000000000000000000000000",
      },
      replayAccounts: [
        {
          address: COWSWAP_TWAP_TX.safe,
          balance: "0",
          nonce: 0,
          code: "0x",
          storage: {},
        },
      ],
    });

    const base = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const evidence = {
      ...base,
      transaction: {
        ...base.transaction,
        operation: 0 as const,
      },
    };
    const { evidence: enriched } = await enrichWithSimulation(evidence, {
      rpcUrl: "https://rpc.example",
    });

    expect(enriched.simulation?.logs).toEqual([simulationLog]);
    expect(enriched.simulationWitness?.witnessOnly).toBe(true);
    expect(enriched.simulationWitness?.simulationDigest).toBe(
      computeSimulationDigest(enriched.simulation!)
    );
  });

  it("keeps packaged simulation effects when witness replay accounts are missing", async () => {
    const simulationLog = {
      address: "0x1111111111111111111111111111111111111111",
      topics: [],
      data: "0x",
    };
    fetchSimulationMock.mockResolvedValue({
      success: true,
      returnData: "0x",
      gasUsed: "1",
      logs: [simulationLog],
      blockNumber: 21000000,
      trust: "rpc-sourced",
    });
    fetchSimulationWitnessMock.mockResolvedValue({
      chainId: CHAIN_ID,
      safeAddress: COWSWAP_TWAP_TX.safe,
      blockNumber: 21000000,
      stateRoot:
        "0xa38574512fb60ec85617785cd52c30f918902b355bab53242fbdf3b40b7a1e7e",
      safeAccountProof: {
        address: COWSWAP_TWAP_TX.safe,
        balance: "0",
        nonce: 0,
        codeHash:
          "0x1122334411223344112233441122334411223344112233441122334411223344",
        storageHash:
          "0x5566778855667788556677885566778855667788556677885566778855667788",
        accountProof: [],
        storageProof: [],
      },
      overriddenSlots: [],
      simulationDigest:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      replayCaller: COWSWAP_TWAP_TX.safe,
    });

    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const { evidence: enriched } = await enrichWithSimulation(evidence, {
      rpcUrl: "https://rpc.example",
    });

    expect(enriched.simulation?.logs).toEqual([simulationLog]);
    expect(enriched.simulationWitness?.witnessOnly).toBeUndefined();
  });

  it("keeps packaged simulation effects when witness replay block context is missing", async () => {
    const simulationLog = {
      address: "0x1111111111111111111111111111111111111111",
      topics: [],
      data: "0x",
    };
    fetchSimulationMock.mockResolvedValue({
      success: true,
      returnData: "0x",
      gasUsed: "1",
      logs: [simulationLog],
      blockNumber: 21000000,
      trust: "rpc-sourced",
    });
    fetchSimulationWitnessMock.mockResolvedValue({
      chainId: CHAIN_ID,
      safeAddress: COWSWAP_TWAP_TX.safe,
      blockNumber: 21000000,
      stateRoot:
        "0xa38574512fb60ec85617785cd52c30f918902b355bab53242fbdf3b40b7a1e7e",
      safeAccountProof: {
        address: COWSWAP_TWAP_TX.safe,
        balance: "0",
        nonce: 0,
        codeHash:
          "0x1122334411223344112233441122334411223344112233441122334411223344",
        storageHash:
          "0x5566778855667788556677885566778855667788556677885566778855667788",
        accountProof: [],
        storageProof: [],
      },
      overriddenSlots: [],
      simulationDigest:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      replayAccounts: [
        {
          address: COWSWAP_TWAP_TX.safe,
          balance: "0",
          nonce: 0,
          code: "0x",
          storage: {},
        },
      ],
      replayCaller: COWSWAP_TWAP_TX.safe,
    });

    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const { evidence: enriched } = await enrichWithSimulation(evidence, {
      rpcUrl: "https://rpc.example",
    });

    expect(enriched.simulation?.logs).toEqual([simulationLog]);
    expect(enriched.simulationWitness?.witnessOnly).toBeUndefined();
  });

  it("keeps packaged simulation effects for DELEGATECALL even when replay witness inputs exist", async () => {
    const simulationLog = {
      address: "0x1111111111111111111111111111111111111111",
      topics: [],
      data: "0x",
    };
    fetchSimulationMock.mockResolvedValue({
      success: true,
      returnData: "0x",
      gasUsed: "1",
      logs: [simulationLog],
      blockNumber: 21000000,
      trust: "rpc-sourced",
    });
    fetchSimulationWitnessMock.mockResolvedValue({
      chainId: CHAIN_ID,
      safeAddress: COWSWAP_TWAP_TX.safe,
      blockNumber: 21000000,
      stateRoot:
        "0xa38574512fb60ec85617785cd52c30f918902b355bab53242fbdf3b40b7a1e7e",
      safeAccountProof: {
        address: COWSWAP_TWAP_TX.safe,
        balance: "0",
        nonce: 0,
        codeHash:
          "0x1122334411223344112233441122334411223344112233441122334411223344",
        storageHash:
          "0x5566778855667788556677885566778855667788556677885566778855667788",
        accountProof: [],
        storageProof: [],
      },
      overriddenSlots: [],
      simulationDigest:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      replayBlock: {
        timestamp: "1700000000",
        gasLimit: "30000000",
        baseFeePerGas: "1",
        beneficiary: "0x0000000000000000000000000000000000000000",
      },
      replayAccounts: [
        {
          address: COWSWAP_TWAP_TX.safe,
          balance: "0",
          nonce: 0,
          code: "0x",
          storage: {},
        },
      ],
    });

    const base = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const evidence = {
      ...base,
      transaction: {
        ...base.transaction,
        operation: 1 as const,
      },
    };
    const { evidence: enriched } = await enrichWithSimulation(evidence, {
      rpcUrl: "https://rpc.example",
    });

    expect(enriched.simulation?.logs).toEqual([simulationLog]);
    expect(enriched.simulationWitness?.witnessOnly).toBeUndefined();
  });
});
