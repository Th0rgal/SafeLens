import { describe, it, expect } from "vitest";
import {
  createEvidencePackage,
  exportEvidencePackage,
  finalizeEvidenceExport,
} from "../creator";
import {
  COWSWAP_TWAP_TX,
  CHAIN_ID,
  TX_URL,
  EXPECTED_SAFE_TX_HASH,
} from "../../safe/__tests__/fixtures/cowswap-twap-tx";

describe("createEvidencePackage", () => {
  it("creates a valid evidence package from the transaction fixture", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);

    expect(evidence.version).toBe("1.0");
    expect(evidence.safeAddress).toBe(COWSWAP_TWAP_TX.safe);
    expect(evidence.safeTxHash).toBe(EXPECTED_SAFE_TX_HASH);
    expect(evidence.chainId).toBe(CHAIN_ID);
  });

  it("preserves all transaction fields needed for hash recomputation", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);

    expect(evidence.transaction.to).toBe(COWSWAP_TWAP_TX.to);
    expect(evidence.transaction.value).toBe(COWSWAP_TWAP_TX.value);
    expect(evidence.transaction.data).toBe(COWSWAP_TWAP_TX.data);
    expect(evidence.transaction.operation).toBe(COWSWAP_TWAP_TX.operation);
    expect(evidence.transaction.nonce).toBe(COWSWAP_TWAP_TX.nonce);
    expect(evidence.transaction.safeTxGas).toBe(COWSWAP_TWAP_TX.safeTxGas);
    expect(evidence.transaction.baseGas).toBe(COWSWAP_TWAP_TX.baseGas);
    expect(evidence.transaction.gasPrice).toBe(COWSWAP_TWAP_TX.gasPrice);
    expect(evidence.transaction.gasToken).toBe(COWSWAP_TWAP_TX.gasToken);
    expect(evidence.transaction.refundReceiver).toBe(
      COWSWAP_TWAP_TX.refundReceiver
    );
  });

  it("maps confirmations correctly", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);

    expect(evidence.confirmations).toHaveLength(1);
    expect(evidence.confirmations[0].owner).toBe(
      COWSWAP_TWAP_TX.confirmations[0].owner
    );
    expect(evidence.confirmations[0].signature).toBe(
      COWSWAP_TWAP_TX.confirmations[0].signature
    );
    expect(evidence.confirmations[0].submissionDate).toBe(
      COWSWAP_TWAP_TX.confirmations[0].submissionDate
    );
  });

  it("records confirmationsRequired", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    expect(evidence.confirmationsRequired).toBe(3);
  });

  it("includes source URLs", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);

    expect(evidence.sources.safeApiUrl).toBe(
      "https://safe-transaction-mainnet.safe.global"
    );
    expect(evidence.sources.transactionUrl).toBe(TX_URL);
  });

  it("sets packagedAt to a valid ISO timestamp", () => {
    const before = new Date().toISOString();
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const after = new Date().toISOString();

    expect(evidence.packagedAt >= before).toBe(true);
    expect(evidence.packagedAt <= after).toBe(true);
  });
});

describe("exportEvidencePackage", () => {
  it("produces valid JSON", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const json = exportEvidencePackage(evidence);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("round-trips without data loss", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const json = exportEvidencePackage(evidence);
    const parsed = JSON.parse(json);

    expect(parsed.safeTxHash).toBe(EXPECTED_SAFE_TX_HASH);
    expect(parsed.transaction.data).toBe(COWSWAP_TWAP_TX.data);
    expect(parsed.confirmations[0].signature).toBe(
      COWSWAP_TWAP_TX.confirmations[0].signature
    );
  });
});

describe("finalizeEvidenceExport", () => {
  it("marks package as fully-verifiable when consensus and policy proofs are present", () => {
    const base = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const evidence = {
      ...base,
      onchainPolicyProof: {
        blockNumber: 1,
        stateRoot:
          "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
        accountProof: {
          address: COWSWAP_TWAP_TX.safe,
          balance: "0",
          codeHash:
            "0x1111111111111111111111111111111111111111111111111111111111111111",
          nonce: 0,
          storageHash:
            "0x2222222222222222222222222222222222222222222222222222222222222222",
          accountProof: [],
          storageProof: [],
        },
        decodedPolicy: {
          owners: [COWSWAP_TWAP_TX.confirmations[0].owner],
          threshold: 1,
          nonce: 0,
          modules: [],
          guard: "0x0000000000000000000000000000000000000000",
          fallbackHandler: "0x0000000000000000000000000000000000000000",
          singleton: "0x0000000000000000000000000000000000000000",
        },
        trust: "rpc-sourced" as const,
      },
      consensusProof: {
        checkpoint:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        bootstrap: "{}",
        updates: [],
        finalityUpdate: "{}",
        network: "mainnet" as const,
        stateRoot:
          "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
        blockNumber: 1,
        finalizedSlot: 1,
      },
      simulation: {
        success: true,
        returnData: "0x",
        gasUsed: "1",
        logs: [],
        blockNumber: 1,
        trust: "rpc-sourced" as const,
      },
    };

    const finalized = finalizeEvidenceExport(evidence, {
      rpcProvided: true,
      consensusProofAttempted: true,
      consensusProofFailed: false,
      onchainPolicyProofAttempted: true,
      onchainPolicyProofFailed: false,
      simulationAttempted: true,
      simulationFailed: false,
    });

    expect(finalized.exportContract?.mode).toBe("fully-verifiable");
    expect(finalized.exportContract?.isFullyVerifiable).toBe(true);
    expect(finalized.exportContract?.status).toBe("complete");
  });

  it("marks package as partial and records machine-readable reasons", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const finalized = finalizeEvidenceExport(evidence, {
      rpcProvided: false,
      consensusProofAttempted: true,
      consensusProofFailed: true,
      onchainPolicyProofAttempted: false,
      onchainPolicyProofFailed: false,
      simulationAttempted: false,
      simulationFailed: false,
    });

    expect(finalized.exportContract?.mode).toBe("partial");
    expect(finalized.exportContract?.status).toBe("partial");
    expect(finalized.exportContract?.reasons).toContain("missing-rpc-url");
    expect(finalized.exportContract?.reasons).toContain("consensus-proof-fetch-failed");
    expect(finalized.exportContract?.reasons).toContain("missing-onchain-policy-proof");
  });

  it("records unsupported consensus mode explicitly", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const finalized = finalizeEvidenceExport(evidence, {
      rpcProvided: false,
      consensusProofAttempted: true,
      consensusProofFailed: true,
      consensusProofUnsupportedMode: true,
      onchainPolicyProofAttempted: false,
      onchainPolicyProofFailed: false,
      simulationAttempted: false,
      simulationFailed: false,
    });

    expect(finalized.exportContract?.reasons).toContain("unsupported-consensus-mode");
    expect(finalized.exportContract?.reasons).not.toContain("consensus-proof-fetch-failed");
  });

  it("records feature-flag-disabled consensus mode explicitly", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const finalized = finalizeEvidenceExport(evidence, {
      rpcProvided: false,
      consensusProofAttempted: true,
      consensusProofFailed: true,
      consensusProofDisabledByFeatureFlag: true,
      onchainPolicyProofAttempted: false,
      onchainPolicyProofFailed: false,
      simulationAttempted: false,
      simulationFailed: false,
    });

    expect(finalized.exportContract?.reasons).toContain("consensus-mode-disabled-by-feature-flag");
    expect(finalized.exportContract?.reasons).not.toContain("unsupported-consensus-mode");
    expect(finalized.exportContract?.reasons).not.toContain("consensus-proof-fetch-failed");
  });

  it.each([
    {
      chainId: 10,
      consensusMode: "opstack" as const,
      network: "optimism" as const,
    },
    {
      chainId: 8453,
      consensusMode: "opstack" as const,
      network: "base" as const,
    },
    {
      chainId: 59144,
      consensusMode: "linea" as const,
      network: "linea" as const,
    },
  ])(
    "marks export fully verifiable when $consensusMode consensus artifact exists with policy proof and simulation",
    ({ chainId, consensusMode, network }) => {
      const base = createEvidencePackage(COWSWAP_TWAP_TX, chainId, TX_URL);
      const evidence = {
        ...base,
        onchainPolicyProof: {
          blockNumber: 1,
          stateRoot:
            "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
          accountProof: {
            address: COWSWAP_TWAP_TX.safe,
            balance: "0",
            codeHash:
              "0x1111111111111111111111111111111111111111111111111111111111111111",
            nonce: 0,
            storageHash:
              "0x2222222222222222222222222222222222222222222222222222222222222222",
            accountProof: [],
            storageProof: [],
          },
          decodedPolicy: {
            owners: [COWSWAP_TWAP_TX.confirmations[0].owner],
            threshold: 1,
            nonce: 0,
            modules: [],
            guard: "0x0000000000000000000000000000000000000000",
            fallbackHandler: "0x0000000000000000000000000000000000000000",
            singleton: "0x0000000000000000000000000000000000000000",
          },
          trust: "rpc-sourced" as const,
        },
        consensusProof: {
          consensusMode,
          network,
          proofPayload: "{\"kind\":\"envelope-only\"}",
          stateRoot:
            "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
          blockNumber: 1,
        },
        simulation: {
          success: true,
          returnData: "0x",
          gasUsed: "1",
          logs: [],
          blockNumber: 1,
          trust: "rpc-sourced" as const,
        },
      };

      const finalized = finalizeEvidenceExport(evidence, {
        rpcProvided: true,
        consensusProofAttempted: true,
        consensusProofFailed: false,
        onchainPolicyProofAttempted: true,
        onchainPolicyProofFailed: false,
        simulationAttempted: true,
        simulationFailed: false,
      });

      expect(finalized.exportContract?.mode).toBe("fully-verifiable");
      expect(finalized.exportContract?.status).toBe("complete");
      expect(finalized.exportContract?.isFullyVerifiable).toBe(true);
      expect(finalized.exportContract?.reasons).not.toContain(
        "opstack-consensus-verifier-pending"
      );
      expect(finalized.exportContract?.reasons).not.toContain(
        "linea-consensus-verifier-pending"
      );
      expect(finalized.exportContract?.reasons).not.toContain("unsupported-consensus-mode");
      expect(finalized.exportContract?.artifacts.consensusProof).toBe(true);
    }
  );

  it.each([
    { chainId: 10, label: "opstack" },
    { chainId: 8453, label: "base-opstack" },
    { chainId: 59144, label: "linea" },
  ])(
    "marks consensus fetch failure for $label chains when enrichment was attempted and failed",
    ({ chainId }) => {
      const evidence = createEvidencePackage(COWSWAP_TWAP_TX, chainId, TX_URL);
      const finalized = finalizeEvidenceExport(evidence, {
        rpcProvided: false,
        consensusProofAttempted: true,
        consensusProofFailed: true,
        onchainPolicyProofAttempted: false,
        onchainPolicyProofFailed: false,
        simulationAttempted: false,
        simulationFailed: false,
      });

      expect(finalized.exportContract?.reasons).toContain("consensus-proof-fetch-failed");
      expect(finalized.exportContract?.reasons).not.toContain("missing-consensus-proof");
      expect(finalized.exportContract?.reasons).toContain("missing-rpc-url");
    }
  );
});
