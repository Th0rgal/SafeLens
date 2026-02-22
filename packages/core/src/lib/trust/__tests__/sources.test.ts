import { describe, expect, it } from "vitest";
import {
  GENERATION_SOURCE_IDS,
  VERIFICATION_SOURCE_IDS,
  buildGenerationSources,
  buildVerificationSources,
  createVerificationSourceContext,
} from "../sources";
import { CONSENSUS_TRUST_DECISION_SUMMARY_BY_REASON } from "../../verify";

describe("buildVerificationSources", () => {
  it("documents generation assumptions with explicit trust levels", () => {
    const sources = buildGenerationSources();

    expect(sources.map((s) => s.id)).toEqual([
      GENERATION_SOURCE_IDS.SAFE_URL_INPUT,
      GENERATION_SOURCE_IDS.SAFE_API_RESPONSE,
      GENERATION_SOURCE_IDS.PACKAGED_AT_TIMESTAMP,
      GENERATION_SOURCE_IDS.EXPORTED_JSON,
    ]);
    expect(sources.find((s) => s.id === GENERATION_SOURCE_IDS.SAFE_API_RESPONSE)?.trust).toBe(
      "api-sourced"
    );
  });

  it("describes all core verification sources when settings are enabled", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: true,
      hasUnsupportedSignatures: false,
      hasDecodedData: true,
      hasOnchainPolicyProof: false,
      hasSimulation: false,
      hasConsensusProof: false,
    }));

    expect(sources).toHaveLength(10);
    expect(sources.map((s) => s.id)).toEqual([
      VERIFICATION_SOURCE_IDS.EVIDENCE_PACKAGE,
      VERIFICATION_SOURCE_IDS.HASH_RECOMPUTE,
      VERIFICATION_SOURCE_IDS.SIGNATURES,
      VERIFICATION_SOURCE_IDS.SIGNATURE_SCHEME_COVERAGE,
      VERIFICATION_SOURCE_IDS.SAFE_OWNERS_THRESHOLD,
      VERIFICATION_SOURCE_IDS.ONCHAIN_POLICY_PROOF,
      VERIFICATION_SOURCE_IDS.DECODED_CALLDATA,
      VERIFICATION_SOURCE_IDS.SIMULATION,
      VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF,
      VERIFICATION_SOURCE_IDS.SETTINGS,
    ]);
    expect(sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SETTINGS)?.status).toBe("enabled");
    expect(sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SETTINGS)?.trust).toBe("user-provided");
    expect(sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.HASH_RECOMPUTE)?.summary).toContain("Recomputed");
    expect(sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SIGNATURE_SCHEME_COVERAGE)?.status).toBe("disabled");
    expect(sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.ONCHAIN_POLICY_PROOF)?.status).toBe("disabled");
    expect(sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SIMULATION)?.status).toBe("disabled");
  });

  it("marks decoded calldata as self-verified when all local checks pass", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: true,
      decodedCalldataVerification: "self-verified",
      hasOnchainPolicyProof: false,
      hasSimulation: false,
      hasConsensusProof: false,
    }));

    const decodedSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.DECODED_CALLDATA);
    expect(decodedSource?.trust).toBe("self-verified");
    expect(decodedSource?.summary).toContain("locally verified");
  });

  it("marks decoded calldata as partial when only some local checks can run", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: true,
      decodedCalldataVerification: "partial",
      hasOnchainPolicyProof: false,
      hasSimulation: false,
      hasConsensusProof: false,
    }));

    const decodedSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.DECODED_CALLDATA);
    expect(decodedSource?.trust).toBe("api-sourced");
    expect(decodedSource?.summary).toContain("partially");
  });

  it("keeps decoded calldata api-sourced when local checks detect mismatch", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: true,
      decodedCalldataVerification: "mismatch",
      hasOnchainPolicyProof: false,
      hasSimulation: false,
      hasConsensusProof: false,
    }));

    const decodedSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.DECODED_CALLDATA);
    expect(decodedSource?.trust).toBe("api-sourced");
    expect(decodedSource?.summary).toContain("conflicts");
  });

  it("marks settings source disabled when no settings are available", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: false,
      hasSimulation: false,
      hasConsensusProof: false,
    }));

    const settingsSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SETTINGS);
    expect(settingsSource).toBeDefined();
    expect(settingsSource?.status).toBe("disabled");
    expect(settingsSource?.trust).toBe("api-sourced");
    expect(settingsSource?.summary).toContain("No local settings file");
  });

  it("uses self-verified sources for cryptographic checks", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: true,
      hasUnsupportedSignatures: false,
      hasDecodedData: true,
      hasOnchainPolicyProof: false,
      hasSimulation: false,
      hasConsensusProof: false,
    }));

    const cryptoSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SIGNATURES);
    expect(cryptoSource?.trust).toBe("self-verified");
    expect(cryptoSource?.detail).toMatch(/signature/i);

    const hashSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.HASH_RECOMPUTE);
    expect(hashSource?.trust).toBe("self-verified");
    expect(hashSource?.detail).toMatch(/safeTxHash/i);
  });

  it("flags unsupported signature schemes as an explicit api-sourced assumption", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: true,
      hasUnsupportedSignatures: true,
      hasDecodedData: true,
      hasOnchainPolicyProof: false,
      hasSimulation: false,
      hasConsensusProof: false,
    }));

    const coverage = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SIGNATURE_SCHEME_COVERAGE);
    expect(coverage).toBeDefined();
    expect(coverage?.trust).toBe("api-sourced");
    expect(coverage?.status).toBe("enabled");
    expect(coverage?.summary).toMatch(/unsupported signature scheme/i);
  });

  it("upgrades safe-owners-threshold to proof-verified when policy proof is present", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: true,
      hasSimulation: false,
      hasConsensusProof: false,
      onchainPolicyProofTrust: "proof-verified",
    }));

    const ownersSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SAFE_OWNERS_THRESHOLD);
    expect(ownersSource?.trust).toBe("proof-verified");
    expect(ownersSource?.summary).toContain("storage proofs");

    const proofSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.ONCHAIN_POLICY_PROOF);
    expect(proofSource?.status).toBe("enabled");
    expect(proofSource?.trust).toBe("proof-verified");
  });

  it("marks simulation as enabled with rpc-sourced trust when present", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: false,
      hasSimulation: true,
      hasConsensusProof: false,
      simulationTrust: "rpc-sourced",
    }));

    const simSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SIMULATION);
    expect(simSource?.status).toBe("enabled");
    expect(simSource?.trust).toBe("rpc-sourced");
    expect(simSource?.summary).toContain("simulated");
  });

  it("explains replay-not-run when witness checks pass but local replay is unavailable", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: true,
      hasSimulation: true,
      hasSimulationWitness: true,
      simulationTrust: "rpc-sourced",
      simulationVerificationReason: "simulation-replay-not-run",
      hasConsensusProof: false,
    }));

    const simSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SIMULATION);
    expect(simSource?.trust).toBe("rpc-sourced");
    expect(simSource?.summary).toContain("local replay was not run");
  });

  it("explains missing witness when simulation has no witness artifact", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: false,
      hasSimulation: true,
      hasSimulationWitness: false,
      simulationTrust: "rpc-sourced",
      simulationVerificationReason: "missing-simulation-witness",
      hasConsensusProof: false,
    }));

    const simSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SIMULATION);
    expect(simSource?.trust).toBe("rpc-sourced");
    expect(simSource?.summary).toContain("No simulation witness was included");
  });

  it("explains witness-proof-failed when witness checks fail", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: true,
      hasSimulation: true,
      hasSimulationWitness: true,
      simulationTrust: "rpc-sourced",
      simulationVerificationReason: "simulation-witness-proof-failed",
      hasConsensusProof: false,
    }));

    const simSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SIMULATION);
    expect(simSource?.trust).toBe("rpc-sourced");
    expect(simSource?.summary).toContain("witness checks failed");
  });

  it("explains replay-exec-error when local replay execution fails", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: true,
      hasSimulation: true,
      hasSimulationWitness: true,
      simulationTrust: "rpc-sourced",
      simulationVerificationReason: "simulation-replay-exec-error",
      hasConsensusProof: false,
    }));

    const simSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SIMULATION);
    expect(simSource?.trust).toBe("rpc-sourced");
    expect(simSource?.summary).toContain("Local replay execution failed");
  });

  it("respects custom trust levels for policy proof and simulation", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: true,
      hasSimulation: true,
      hasConsensusProof: false,
      onchainPolicyProofTrust: "rpc-sourced",
      simulationTrust: "proof-verified",
    }));

    const proofSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.ONCHAIN_POLICY_PROOF);
    expect(proofSource?.trust).toBe("rpc-sourced");

    const simSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.SIMULATION);
    expect(simSource?.trust).toBe("proof-verified");
  });

  it("uses centralized consensus reason summaries for non-upgrade trust output", () => {
    const reason = "state-root-mismatch-policy-proof" as const;
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: true,
      hasSimulation: false,
      hasConsensusProof: true,
      consensusVerified: false,
      consensusTrustDecisionReason: reason,
    }));

    const consensusSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF);
    expect(consensusSource?.summary).toContain(
      CONSENSUS_TRUST_DECISION_SUMMARY_BY_REASON[reason]
    );
    expect(consensusSource?.detail).toContain(
      CONSENSUS_TRUST_DECISION_SUMMARY_BY_REASON[reason]
    );
  });

  it("surfaces feature-flag-disabled consensus omission when no consensus proof is included", () => {
    const reason = "consensus-mode-disabled-by-feature-flag" as const;
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: false,
      hasSimulation: false,
      hasConsensusProof: false,
      consensusVerified: false,
      consensusTrustDecisionReason: reason,
    }));

    const consensusSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF);
    expect(consensusSource?.summary).toContain(
      CONSENSUS_TRUST_DECISION_SUMMARY_BY_REASON[reason]
    );
    expect(consensusSource?.detail).toContain(
      CONSENSUS_TRUST_DECISION_SUMMARY_BY_REASON[reason]
    );
  });

  it("uses mode-aware wording for unverified OP Stack consensus proofs", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: true,
      hasSimulation: false,
      hasConsensusProof: true,
      consensusVerified: false,
      consensusMode: "opstack",
    }));

    const consensusSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF);
    expect(consensusSource?.summary).toContain("Consensus proof (OP Stack) included");
    expect(consensusSource?.detail).toContain("contains OP Stack consensus data");
  });

  it("uses mode-specific trust for verified OP Stack consensus proofs", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: true,
      hasSimulation: false,
      hasConsensusProof: true,
      consensusVerified: true,
      consensusMode: "opstack",
    }));

    const consensusSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF);
    expect(consensusSource?.trust).toBe("consensus-verified-opstack");
    expect(consensusSource?.summary).toContain("verified against OP Stack consensus");
    expect(consensusSource?.summary).toContain("not equivalent to Beacon light-client finality");
    expect(consensusSource?.detail).toContain("not equivalent to Beacon light-client finality");
  });

  it("uses mode-aware wording for verified Linea consensus proofs", () => {
    const sources = buildVerificationSources(createVerificationSourceContext({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
      hasOnchainPolicyProof: true,
      hasSimulation: false,
      hasConsensusProof: true,
      consensusVerified: true,
      consensusMode: "linea",
    }));

    const consensusSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF);
    expect(consensusSource?.trust).toBe("consensus-verified-linea");
    expect(consensusSource?.summary).toContain("verified against Linea consensus");
    expect(consensusSource?.detail).toContain("verified against Linea consensus data");
    expect(consensusSource?.summary).toContain("not equivalent to Beacon light-client finality");
    expect(consensusSource?.detail).toContain("not equivalent to Beacon light-client finality");
  });

  it("uses deterministic verified trust mapping for every consensus mode", () => {
    const cases = [
      { mode: "beacon" as const, expected: "consensus-verified-beacon" as const },
      { mode: "opstack" as const, expected: "consensus-verified-opstack" as const },
      { mode: "linea" as const, expected: "consensus-verified-linea" as const },
    ];

    for (const { mode, expected } of cases) {
      const sources = buildVerificationSources(createVerificationSourceContext({
        hasSettings: false,
        hasUnsupportedSignatures: false,
        hasDecodedData: false,
        hasOnchainPolicyProof: true,
        hasSimulation: false,
        hasConsensusProof: true,
        consensusVerified: true,
        consensusMode: mode,
      }));
      const consensusSource = sources.find((s) => s.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF);
      expect(consensusSource?.trust).toBe(expected);
    }
  });
});
