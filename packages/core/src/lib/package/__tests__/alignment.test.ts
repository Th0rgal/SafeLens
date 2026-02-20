import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ConsensusProof, OnchainPolicyProof } from "../../types";
import {
  createEvidencePackage,
  enrichWithConsensusProof,
  enrichWithOnchainProof,
  PROOF_ALIGNMENT_ERROR_CODE,
} from "../creator";
import { COWSWAP_TWAP_TX, CHAIN_ID, TX_URL } from "../../safe/__tests__/fixtures/cowswap-twap-tx";

type BeaconConsensusProof = Extract<ConsensusProof, { checkpoint: string }>;

const { fetchOnchainPolicyProofMock, fetchConsensusProofMock } = vi.hoisted(
  () => ({
    fetchOnchainPolicyProofMock: vi.fn(),
    fetchConsensusProofMock: vi.fn(),
  })
);

vi.mock("../../proof", () => ({
  fetchOnchainPolicyProof: fetchOnchainPolicyProofMock,
}));

vi.mock("../../consensus", () => ({
  fetchConsensusProof: fetchConsensusProofMock,
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
});
