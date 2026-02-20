import { describe, expect, it } from "bun:test";
import type { EvidencePackage } from "@safelens/core";
import { buildNetworkSupportStatus } from "../src/lib/network-support";

function makeEvidence(
  chainId: number,
  options: { consensusProof?: boolean; simulation?: boolean } = {}
): Pick<EvidencePackage, "chainId" | "consensusProof" | "simulation"> {
  return {
    chainId,
    consensusProof: options.consensusProof
      ? ({ consensusMode: "beacon" } as EvidencePackage["consensusProof"])
      : undefined,
    simulation: options.simulation
      ? ({ simulationResult: { success: true } } as EvidencePackage["simulation"])
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
});
