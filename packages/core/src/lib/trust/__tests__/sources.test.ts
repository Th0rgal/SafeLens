import { describe, expect, it } from "vitest";
import { buildGenerationSources, buildVerificationSources } from "../sources";

describe("buildVerificationSources", () => {
  it("documents generation assumptions with explicit trust levels", () => {
    const sources = buildGenerationSources();

    expect(sources.map((s) => s.id)).toEqual([
      "safe-url-input",
      "safe-api-response",
      "packaged-at-timestamp",
      "exported-json",
    ]);
    expect(sources.find((s) => s.id === "safe-api-response")?.trust).toBe(
      "api-sourced"
    );
  });

  it("describes all core verification sources when settings are enabled", () => {
    const sources = buildVerificationSources({
      hasSettings: true,
      hasUnsupportedSignatures: false,
      hasDecodedData: true,
      hasOnchainPolicyProof: false,
      hasSimulation: false,
    });

    expect(sources).toHaveLength(9);
    expect(sources.map((s) => s.id)).toEqual([
      "evidence-package",
      "hash-recompute",
      "signatures",
      "signature-scheme-coverage",
      "safe-owners-threshold",
      "onchain-policy-proof",
      "decoded-calldata",
      "simulation",
      "settings",
    ]);
    expect(sources.find((s) => s.id === "settings")?.status).toBe("enabled");
    expect(sources.find((s) => s.id === "settings")?.trust).toBe("user-provided");
    expect(sources.find((s) => s.id === "hash-recompute")?.summary).toContain("Recomputed");
    expect(sources.find((s) => s.id === "signature-scheme-coverage")?.status).toBe("disabled");
    expect(sources.find((s) => s.id === "onchain-policy-proof")?.status).toBe("disabled");
    expect(sources.find((s) => s.id === "simulation")?.status).toBe("disabled");
  });

  it("marks settings source disabled when no settings are available", () => {
    const sources = buildVerificationSources({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: false,
      hasSimulation: false,
    });

    const settingsSource = sources.find((s) => s.id === "settings");
    expect(settingsSource).toBeDefined();
    expect(settingsSource?.status).toBe("disabled");
    expect(settingsSource?.trust).toBe("api-sourced");
    expect(settingsSource?.summary).toContain("No local settings file");
  });

  it("uses self-verified sources for cryptographic checks", () => {
    const sources = buildVerificationSources({
      hasSettings: true,
      hasUnsupportedSignatures: false,
      hasDecodedData: true,
      hasOnchainPolicyProof: false,
      hasSimulation: false,
    });

    const cryptoSource = sources.find((s) => s.id === "signatures");
    expect(cryptoSource?.trust).toBe("self-verified");
    expect(cryptoSource?.detail).toMatch(/signature/i);

    const hashSource = sources.find((s) => s.id === "hash-recompute");
    expect(hashSource?.trust).toBe("self-verified");
    expect(hashSource?.detail).toMatch(/safeTxHash/i);
  });

  it("flags unsupported signature schemes as an explicit api-sourced assumption", () => {
    const sources = buildVerificationSources({
      hasSettings: true,
      hasUnsupportedSignatures: true,
      hasDecodedData: true,
      hasOnchainPolicyProof: false,
      hasSimulation: false,
    });

    const coverage = sources.find((s) => s.id === "signature-scheme-coverage");
    expect(coverage).toBeDefined();
    expect(coverage?.trust).toBe("api-sourced");
    expect(coverage?.status).toBe("enabled");
    expect(coverage?.summary).toMatch(/unsupported signature scheme/i);
  });

  it("upgrades safe-owners-threshold to proof-verified when policy proof is present", () => {
    const sources = buildVerificationSources({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: true,
      hasSimulation: false,
      onchainPolicyProofTrust: "proof-verified",
    });

    const ownersSource = sources.find((s) => s.id === "safe-owners-threshold");
    expect(ownersSource?.trust).toBe("proof-verified");
    expect(ownersSource?.summary).toContain("storage proofs");

    const proofSource = sources.find((s) => s.id === "onchain-policy-proof");
    expect(proofSource?.status).toBe("enabled");
    expect(proofSource?.trust).toBe("proof-verified");
  });

  it("marks simulation as enabled with rpc-sourced trust when present", () => {
    const sources = buildVerificationSources({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: false,
      hasSimulation: true,
      simulationTrust: "rpc-sourced",
    });

    const simSource = sources.find((s) => s.id === "simulation");
    expect(simSource?.status).toBe("enabled");
    expect(simSource?.trust).toBe("rpc-sourced");
    expect(simSource?.summary).toContain("simulated");
  });

  it("respects custom trust levels for policy proof and simulation", () => {
    const sources = buildVerificationSources({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: true,
      hasSimulation: true,
      onchainPolicyProofTrust: "rpc-sourced",
      simulationTrust: "proof-verified",
    });

    const proofSource = sources.find((s) => s.id === "onchain-policy-proof");
    expect(proofSource?.trust).toBe("rpc-sourced");

    const simSource = sources.find((s) => s.id === "simulation");
    expect(simSource?.trust).toBe("proof-verified");
  });
});
