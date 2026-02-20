import { describe, expect, it } from "bun:test";
import type { EvidencePackage } from "@safelens/core";
import { buildNetworkSupportStatus } from "../src/lib/network-support";

function makeEvidence(
  chainId: number,
  options: {
    consensusProof?: boolean;
    simulation?: boolean;
    exportReasons?: NonNullable<EvidencePackage["exportContract"]>["reasons"];
  } = {}
): Pick<EvidencePackage, "chainId" | "consensusProof" | "simulation" | "exportContract"> {
  return {
    chainId,
    consensusProof: options.consensusProof
      ? ({ consensusMode: "beacon" } as EvidencePackage["consensusProof"])
      : undefined,
    simulation: options.simulation
      ? ({ simulationResult: { success: true } } as EvidencePackage["simulation"])
      : undefined,
    exportContract: options.exportReasons
      ? ({ type: "partial", reasons: options.exportReasons } as EvidencePackage["exportContract"])
      : undefined,
  };
}

describe("buildNetworkSupportStatus", () => {
  it("returns full support when network and package include full verification artifacts", () => {
    const status = buildNetworkSupportStatus(
      makeEvidence(1, { consensusProof: true, simulation: true })
    );

    expect(status.isFullySupported).toBe(true);
    expect(status.badgeText).toBe("Full");
    expect(status.helperText).toBeNull();
  });

  it("returns partial support when package is missing simulation artifact", () => {
    const status = buildNetworkSupportStatus(
      makeEvidence(1, { consensusProof: true, simulation: false })
    );

    expect(status.isFullySupported).toBe(false);
    expect(status.badgeText).toBe("Partial");
    expect(status.helperText).toContain("simulation was not performed");
  });

  it("returns partial support when package is missing consensus proof artifact", () => {
    const status = buildNetworkSupportStatus(
      makeEvidence(1, { consensusProof: false, simulation: true })
    );

    expect(status.isFullySupported).toBe(false);
    expect(status.badgeText).toBe("Partial");
    expect(status.helperText).toContain("no consensus proof was included");
  });

  it("returns partial support for opstack even when package artifacts are present", () => {
    const status = buildNetworkSupportStatus({
      chainId: 10,
      consensusProof: { consensusMode: "opstack" } as EvidencePackage["consensusProof"],
      simulation: { simulationResult: { success: true } } as EvidencePackage["simulation"],
    });

    expect(status.isFullySupported).toBe(false);
    expect(status.badgeText).toBe("Partial");
    expect(status.helperText).toContain("consensus envelope checks");
  });

  it("returns full support for holesky when package includes consensus and simulation", () => {
    const status = buildNetworkSupportStatus(
      makeEvidence(17000, { consensusProof: true, simulation: true })
    );

    expect(status.isFullySupported).toBe(true);
    expect(status.badgeText).toBe("Full");
    expect(status.helperText).toBeNull();
  });

  it("returns full support for hoodi when package includes consensus and simulation", () => {
    const status = buildNetworkSupportStatus(
      makeEvidence(560048, { consensusProof: true, simulation: true })
    );

    expect(status.isFullySupported).toBe(true);
    expect(status.badgeText).toBe("Full");
    expect(status.helperText).toBeNull();
  });

  it("surfaces feature-flag-disabled consensus mode in helper text", () => {
    const status = buildNetworkSupportStatus(
      makeEvidence(59144, {
        consensusProof: false,
        simulation: true,
        exportReasons: ["consensus-mode-disabled-by-feature-flag"],
      })
    );

    expect(status.isFullySupported).toBe(false);
    expect(status.badgeText).toBe("Partial");
    expect(status.helperText).toContain("disabled by rollout feature flag");
  });

  it("surfaces pending verifier reason instead of generic missing-proof text", () => {
    const status = buildNetworkSupportStatus(
      makeEvidence(10, {
        consensusProof: false,
        simulation: true,
        exportReasons: ["opstack-consensus-verifier-pending"],
      })
    );

    expect(status.isFullySupported).toBe(false);
    expect(status.badgeText).toBe("Partial");
    expect(status.helperText).toContain("full cryptographic consensus verification is still pending");
  });
});
