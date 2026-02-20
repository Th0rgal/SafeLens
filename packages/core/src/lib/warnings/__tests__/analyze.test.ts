import { describe, it, expect } from "vitest";
import { identifyProposer, analyzeTarget, analyzeSigners } from "../analyze";
import type { SettingsConfig } from "../../settings/types";

const mockConfig: SettingsConfig = {
  version: "1.0",
  chains: {
    "1": { name: "Ethereum" },
  },
  addressRegistry: [
    { address: "0xd779332c5A52566Dada11A075a735b18DAa6c1f4", name: "Signer 1", kind: "eoa" },
    { address: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12", name: "Signer 2", kind: "eoa" },
    { address: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2", name: "MultiSend 1.4.1", kind: "contract" },
  ],
  erc7730Descriptors: [],
  disabledInterpreters: [],
};

describe("identifyProposer", () => {
  it("returns the owner with the earliest submissionDate", () => {
    const confirmations = [
      { owner: "0xAAA", submissionDate: "2026-02-03T08:00:00Z" },
      { owner: "0xBBB", submissionDate: "2026-02-03T06:00:00Z" },
      { owner: "0xCCC", submissionDate: "2026-02-03T10:00:00Z" },
    ];
    expect(identifyProposer(confirmations)).toBe("0xBBB");
  });

  it("returns the only owner when there is one confirmation", () => {
    const confirmations = [
      { owner: "0xAAA", submissionDate: "2026-02-03T08:00:00Z" },
    ];
    expect(identifyProposer(confirmations)).toBe("0xAAA");
  });

  it("returns null for empty confirmations", () => {
    expect(identifyProposer([])).toBeNull();
  });

  it("handles identical timestamps by returning the first", () => {
    const confirmations = [
      { owner: "0xAAA", submissionDate: "2026-02-03T08:00:00Z" },
      { owner: "0xBBB", submissionDate: "2026-02-03T08:00:00Z" },
    ];
    expect(identifyProposer(confirmations)).toBe("0xAAA");
  });
});

describe("analyzeTarget", () => {
  it("returns no warnings for a known contract (Call)", () => {
    const warnings = analyzeTarget(
      "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
      0,
      mockConfig
    );
    expect(warnings).toHaveLength(0);
  });

  it("returns info for a known contract with DelegateCall", () => {
    const warnings = analyzeTarget(
      "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
      1,
      mockConfig
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].level).toBe("info");
    expect(warnings[0].message).toContain("DelegateCall to MultiSend 1.4.1");
  });

  it("returns no warnings for unknown target with Call", () => {
    const warnings = analyzeTarget(
      "0x0000000000000000000000000000000000000Bad",
      0,
      mockConfig
    );
    expect(warnings).toHaveLength(0);
  });

  it("returns danger for unknown target with DelegateCall", () => {
    const warnings = analyzeTarget(
      "0x0000000000000000000000000000000000000Bad",
      1,
      mockConfig
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].level).toBe("danger");
    expect(warnings[0].message).toContain("DelegateCall to unknown contract");
  });

  it("resolves EOAs from address registry too", () => {
    const warnings = analyzeTarget(
      "0xd779332c5A52566Dada11A075a735b18DAa6c1f4",
      0,
      mockConfig
    );
    expect(warnings).toHaveLength(0);
  });

  it("is case-insensitive for address matching", () => {
    const warnings = analyzeTarget(
      "0x9641D764FC13C8B624C04430C7356C1C7C8102E2",
      0,
      mockConfig
    );
    expect(warnings).toHaveLength(0);
  });

  it("treats chain-scoped entries as unknown on other chains", () => {
    const scopedConfig: SettingsConfig = {
      ...mockConfig,
      addressRegistry: [
        { address: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2", name: "MultiSend 1.4.1", kind: "contract", chainIds: [1] },
      ],
    };

    const warnings = analyzeTarget(
      "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
      1,
      scopedConfig,
      8453
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].level).toBe("danger");
  });
});

describe("analyzeSigners", () => {
  it("returns no warnings for known signers", () => {
    const confirmations = [
      { owner: "0xd779332c5A52566Dada11A075a735b18DAa6c1f4" },
    ];
    const results = analyzeSigners(confirmations, mockConfig);
    expect(results["0xd779332c5A52566Dada11A075a735b18DAa6c1f4"]).toHaveLength(0);
  });

  it("returns warning for unknown signer", () => {
    const unknownOwner = "0x0000000000000000000000000000000000000Bad";
    const confirmations = [{ owner: unknownOwner }];
    const results = analyzeSigners(confirmations, mockConfig);
    expect(results[unknownOwner]).toHaveLength(1);
    expect(results[unknownOwner][0].level).toBe("warning");
    expect(results[unknownOwner][0].message).toContain("Unknown signer");
  });

  it("handles mix of known and unknown signers", () => {
    const confirmations = [
      { owner: "0xd779332c5A52566Dada11A075a735b18DAa6c1f4" },
      { owner: "0x0000000000000000000000000000000000000Bad" },
      { owner: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" },
    ];
    const results = analyzeSigners(confirmations, mockConfig);
    expect(results["0xd779332c5A52566Dada11A075a735b18DAa6c1f4"]).toHaveLength(0);
    expect(results["0x0000000000000000000000000000000000000Bad"]).toHaveLength(1);
    expect(results["0xABCDEF1234567890ABCDEF1234567890ABCDEF12"]).toHaveLength(0);
  });

  it("is case-insensitive for address matching", () => {
    const confirmations = [
      { owner: "0xD779332C5A52566DADA11A075A735B18DAA6C1F4" },
    ];
    const results = analyzeSigners(confirmations, mockConfig);
    expect(results["0xD779332C5A52566DADA11A075A735B18DAA6C1F4"]).toHaveLength(0);
  });

  it("returns empty record for no confirmations", () => {
    const results = analyzeSigners([], mockConfig);
    expect(Object.keys(results)).toHaveLength(0);
  });
});
