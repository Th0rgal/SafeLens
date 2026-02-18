import { describe, it, expect } from "vitest";
import { verifyEvidencePackage } from "..";
import { createEvidencePackage } from "../../package/creator";
import { COWSWAP_TWAP_TX, CHAIN_ID, TX_URL } from "../../safe/__tests__/fixtures/cowswap-twap-tx";
import type { SettingsConfig } from "../../settings/types";

const VOID_SETTINGS: SettingsConfig = {
  version: "1.0",
  chains: {},
  addressRegistry: [],
  erc7730Descriptors: [],
  disabledInterpreters: [],
};

describe("verifyEvidencePackage", () => {
  it("returns proposer and signature summary for a valid evidence package", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const result = await verifyEvidencePackage(evidence);

    expect(result.proposer).toBe(COWSWAP_TWAP_TX.confirmations[0].owner);
    expect(result.signatures.summary.total).toBe(evidence.confirmations.length);
    expect(result.signatures.summary.valid).toBe(evidence.confirmations.length);
    expect(result.signatures.byOwner[evidence.confirmations[0].owner].status).toBe("valid");
    expect(result.sources).toHaveLength(9);
    expect(result.sources.find((s) => s.id === "settings")?.status).toBe("disabled");
    expect(result.sources.find((s) => s.id === "safe-owners-threshold")?.trust).toBe("api-sourced");
    expect(result.sources.find((s) => s.id === "decoded-calldata")?.status).toBe("enabled");
    // Without policy proof or simulation, those sections should be disabled
    expect(result.sources.find((s) => s.id === "onchain-policy-proof")?.status).toBe("disabled");
    expect(result.sources.find((s) => s.id === "simulation")?.status).toBe("disabled");
  });

  it("returns target warnings when settings are unavailable", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const result = await verifyEvidencePackage(evidence, { settings: VOID_SETTINGS });

    expect(result.targetWarnings).toHaveLength(1);
    expect(result.targetWarnings[0]).toMatchObject({
      level: "danger",
      message: expect.stringContaining("unknown contract"),
    });
    expect(result.sources.find((s) => s.id === "settings")?.status).toBe("enabled");
  });

  it("returns no target warnings without settings", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const result = await verifyEvidencePackage(evidence);

    expect(result.targetWarnings).toHaveLength(0);
  });
});
