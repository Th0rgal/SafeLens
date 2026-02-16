import { describe, it, expect } from "vitest";
import {
  validateEvidencePackage,
  parseEvidencePackage,
} from "../validator";
import { createEvidencePackage, exportEvidencePackage } from "../creator";
import {
  COWSWAP_TWAP_TX,
  CHAIN_ID,
  TX_URL,
  EXPECTED_SAFE_TX_HASH,
} from "../../safe/__tests__/fixtures/cowswap-twap-tx";

function makeValidEvidence() {
  return createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
}

describe("validateEvidencePackage", () => {
  it("validates a correctly constructed evidence package", () => {
    const evidence = makeValidEvidence();
    const result = validateEvidencePackage(evidence);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.safeTxHash).toBe(EXPECTED_SAFE_TX_HASH);
  });

  it("recomputes the Safe tx hash and verifies it matches", () => {
    const evidence = makeValidEvidence();
    const result = validateEvidencePackage(evidence);

    expect(result.valid).toBe(true);
    expect(result.evidence!.safeTxHash.toLowerCase()).toBe(
      EXPECTED_SAFE_TX_HASH.toLowerCase()
    );
  });

  it("detects tampered transaction data (modified nonce)", () => {
    const evidence = makeValidEvidence();
    evidence.transaction.nonce = 999;

    const result = validateEvidencePackage(evidence);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("mismatch");
  });

  it("detects tampered transaction data (modified to address)", () => {
    const evidence = makeValidEvidence();
    evidence.transaction.to = "0x0000000000000000000000000000000000000001";

    const result = validateEvidencePackage(evidence);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("mismatch");
  });

  it("detects tampered calldata", () => {
    const evidence = makeValidEvidence();
    // Flip a byte in the middle of the data
    const data = evidence.transaction.data!;
    evidence.transaction.data =
      data.slice(0, 20) + "ff" + data.slice(22);

    const result = validateEvidencePackage(evidence);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("mismatch");
  });

  it("detects tampered safeTxHash (hash says X but data says Y)", () => {
    const evidence = makeValidEvidence();
    evidence.safeTxHash =
      "0x1111111111111111111111111111111111111111111111111111111111111111";

    const result = validateEvidencePackage(evidence);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("mismatch");
  });

  it("rejects invalid schema (missing required fields)", () => {
    const result = validateEvidencePackage({
      version: "1.0",
      safeAddress: "0x9fC3dc011b461664c835F2527fffb1169b3C213e",
      // missing safeTxHash, chainId, transaction, etc.
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Schema validation failed");
  });

  it("rejects completely invalid input", () => {
    const result = validateEvidencePackage("not an object");

    expect(result.valid).toBe(false);
  });
});

describe("parseEvidencePackage", () => {
  it("parses and validates a JSON string evidence package", () => {
    const evidence = makeValidEvidence();
    const json = exportEvidencePackage(evidence);

    const result = parseEvidencePackage(json);

    expect(result.valid).toBe(true);
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.safeTxHash).toBe(EXPECTED_SAFE_TX_HASH);
  });

  it("rejects invalid JSON", () => {
    const result = parseEvidencePackage("not json {{{");

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid JSON format");
  });

  it("full round-trip: create → export → parse → validate", () => {
    const original = makeValidEvidence();
    const json = exportEvidencePackage(original);
    const result = parseEvidencePackage(json);

    expect(result.valid).toBe(true);
    expect(result.evidence!.safeAddress).toBe(original.safeAddress);
    expect(result.evidence!.safeTxHash).toBe(original.safeTxHash);
    expect(result.evidence!.transaction.data).toBe(
      original.transaction.data
    );
    expect(result.evidence!.confirmations).toEqual(original.confirmations);
  });
});
