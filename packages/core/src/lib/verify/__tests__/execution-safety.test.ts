import { describe, expect, it } from "vitest";
import { buildCoreExecutionSafetyFields } from "../execution-safety";
import { createEvidencePackage } from "../../package/creator";
import {
  CHAIN_ID,
  COWSWAP_TWAP_TX,
  TX_URL,
} from "../../safe/__tests__/fixtures/cowswap-twap-tx";

describe("buildCoreExecutionSafetyFields", () => {
  it("builds deterministic core execution rows", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const rows = buildCoreExecutionSafetyFields(evidence);

    expect(rows.map((row) => row.id)).toEqual([
      "signatures",
      "method",
      "target",
      "operation",
      "value-wei",
      "nonce",
    ]);
    expect(rows[0]).toMatchObject({
      label: "Signatures",
      value: `${evidence.confirmations.length}/${evidence.confirmationsRequired}`,
      monospace: true,
    });
    expect(rows[2]).toMatchObject({
      label: "Target",
      value: evidence.transaction.to,
      monospace: true,
    });
  });

  it("falls back to Unknown when decoded method is absent or invalid", () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const missingMethod = buildCoreExecutionSafetyFields({
      ...evidence,
      dataDecoded: null,
    });
    const invalidMethod = buildCoreExecutionSafetyFields({
      ...evidence,
      dataDecoded: { method: 123 },
    });

    expect(missingMethod.find((row) => row.id === "method")?.value).toBe("Unknown");
    expect(invalidMethod.find((row) => row.id === "method")?.value).toBe("Unknown");
  });
});
