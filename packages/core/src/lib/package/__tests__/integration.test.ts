import { describe, it, expect } from "vitest";
import { createEvidencePackage, exportEvidencePackage } from "../creator";
import { parseEvidencePackage } from "../validator";
import { interpretTransaction } from "../../interpret";
import type { CowSwapTwapDetails } from "../../interpret";
import {
  COWSWAP_TWAP_TX,
  CHAIN_ID,
  TX_URL,
} from "../../safe/__tests__/fixtures/cowswap-twap-tx";

describe("evidence package round-trip", () => {
  it("create → export → parse → verify preserves dataDecoded", () => {
    const pkg = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const json = exportEvidencePackage(pkg);
    const result = parseEvidencePackage(json);

    expect(result.valid).toBe(true);
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.dataDecoded).toBeDefined();
    expect(result.evidence!.dataDecoded).not.toBeNull();
  });

  it("interpretTransaction still returns CowSwap TWAP after round-trip", () => {
    const pkg = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const json = exportEvidencePackage(pkg);
    const result = parseEvidencePackage(json);

    const interpretation = interpretTransaction(
      result.evidence!.dataDecoded,
      result.evidence!.transaction.to,
      result.evidence!.transaction.operation
    );

    expect(interpretation).not.toBeNull();
    expect(interpretation!.protocol).toBe("CoW Swap");
    expect(interpretation!.action).toBe("TWAP Order");

    const details = interpretation!.details as unknown as CowSwapTwapDetails;
    expect(details.sellToken.symbol).toBe("WETH");
    expect(details.buyToken.symbol).toBe("DAI");
    expect(details.numberOfParts).toBe(12);
  });

  it("handles dataDecoded: null without errors", () => {
    // Create a modified tx with null dataDecoded
    const txWithoutDecoded = { ...COWSWAP_TWAP_TX, dataDecoded: null };
    const pkg = createEvidencePackage(txWithoutDecoded, CHAIN_ID, TX_URL);
    const json = exportEvidencePackage(pkg);
    const result = parseEvidencePackage(json);

    expect(result.valid).toBe(true);
    expect(result.evidence!.dataDecoded).toBeNull();

    // interpretTransaction should return null for null dataDecoded
    const interpretation = interpretTransaction(
      result.evidence!.dataDecoded,
      result.evidence!.transaction.to,
      result.evidence!.transaction.operation
    );
    expect(interpretation).toBeNull();
  });
});
