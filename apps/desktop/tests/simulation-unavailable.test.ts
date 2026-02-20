import { describe, expect, it } from "bun:test";
import type { EvidencePackage } from "@safelens/core";
import {
  getSimulationUnavailableReason,
  getSimulationUnavailableReasonCode,
} from "../src/lib/simulation-unavailable";

describe("simulation unavailable reason helpers", () => {
  it("prioritizes missing-rpc-url when multiple simulation reasons exist", () => {
    const evidence = {
      chainId: 1,
      exportContract: {
        reasons: ["missing-simulation", "missing-rpc-url", "simulation-fetch-failed"],
      },
    } as EvidencePackage;

    expect(getSimulationUnavailableReasonCode(evidence)).toBe("missing-rpc-url");
    expect(getSimulationUnavailableReason(evidence)).toBe(
      "Simulation was skipped because no RPC URL was configured during package generation."
    );
  });

  it("returns explicit fetch failure wording", () => {
    const evidence = {
      chainId: 1,
      exportContract: {
        reasons: ["simulation-fetch-failed", "missing-simulation"],
      },
    } as EvidencePackage;

    expect(getSimulationUnavailableReasonCode(evidence)).toBe(
      "simulation-fetch-failed"
    );
    expect(getSimulationUnavailableReason(evidence)).toBe(
      "Simulation could not be fetched during package generation."
    );
  });

  it("returns unsupported-network fallback when no export reason exists", () => {
    const evidence = {
      chainId: 5,
      exportContract: {
        reasons: [],
      },
    } as EvidencePackage;

    expect(getSimulationUnavailableReasonCode(evidence)).toBeNull();
    expect(getSimulationUnavailableReason(evidence)).toBe(
      "Simulation is not available for this network in SafeLens yet."
    );
  });

  it("returns generic fallback for supported networks without simulation metadata", () => {
    const evidence = {
      chainId: 1,
      exportContract: {
        reasons: [],
      },
    } as EvidencePackage;

    expect(getSimulationUnavailableReasonCode(evidence)).toBeNull();
    expect(getSimulationUnavailableReason(evidence)).toBe(
      "No simulation result is available in this evidence package."
    );
  });
});
