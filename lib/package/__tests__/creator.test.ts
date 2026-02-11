import { describe, it, expect } from "vitest";
import { createEvidencePackage, exportEvidencePackage } from "../creator";
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
