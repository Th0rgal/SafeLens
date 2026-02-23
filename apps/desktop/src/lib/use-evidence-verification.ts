import { useEffect, useState } from "react";
import {
  verifyEvidencePackage,
  applySimulationReplayVerificationToReport,
  applyConsensusVerificationToReport,
  VERIFICATION_SOURCE_IDS,
} from "@safelens/core";
import type {
  ConsensusTrustDecisionReason,
  EvidencePackage,
  SignatureCheckResult,
  TransactionWarning,
  SafeTxHashDetails,
  PolicyProofVerificationResult,
  SimulationVerificationResult,
  SimulationReplayVerificationResult,
  ConsensusVerificationResult,
  SettingsConfig,
} from "@safelens/core";
import { invoke } from "@tauri-apps/api/core";

type ConsensusProofVerifyInput = EvidencePackage["consensusProof"] extends infer T
  ? T extends object
    ? T & {
        expectedStateRoot: string;
        packageChainId: number;
        packagePackagedAt: string;
      }
    : never
  : never;

type SimulationReplayVerifyInput = {
  chainId: number;
  safeAddress: string;
  transaction: EvidencePackage["transaction"];
  simulation: NonNullable<EvidencePackage["simulation"]>;
  simulationWitness: NonNullable<EvidencePackage["simulationWitness"]>;
};

type EvidenceVerificationState = {
  errors: string[];
  sigResults: Record<string, SignatureCheckResult>;
  proposer: string | null;
  targetWarnings: TransactionWarning[];
  hashDetails: SafeTxHashDetails | undefined;
  hashMatch: boolean;
  policyProof: PolicyProofVerificationResult | undefined;
  simulationVerification: SimulationVerificationResult | undefined;
  simulationReplayVerification: SimulationReplayVerificationResult | undefined;
  consensusVerification: ConsensusVerificationResult | undefined;
  consensusSourceSummary: string;
  consensusTrustDecisionReason: ConsensusTrustDecisionReason | undefined;
};

const EMPTY_STATE: EvidenceVerificationState = {
  errors: [],
  sigResults: {},
  proposer: null,
  targetWarnings: [],
  hashDetails: undefined,
  hashMatch: true,
  policyProof: undefined,
  simulationVerification: undefined,
  simulationReplayVerification: undefined,
  consensusVerification: undefined,
  consensusSourceSummary: "",
  consensusTrustDecisionReason: undefined,
};

function createConsensusFailureResult(error: string, errorCode: string): ConsensusVerificationResult {
  return {
    valid: false,
    verified_state_root: null,
    verified_block_number: null,
    state_root_matches: false,
    sync_committee_participants: 0,
    error,
    error_code: errorCode,
    checks: [],
  };
}

function createSimulationReplayExecErrorResult(
  error: string
): SimulationReplayVerificationResult {
  return {
    executed: true,
    success: false,
    reason: "simulation-replay-exec-error",
    error,
  };
}

export function useEvidenceVerification(
  evidence: EvidencePackage | null,
  settings: SettingsConfig | null
): EvidenceVerificationState {
  const [state, setState] = useState<EvidenceVerificationState>(EMPTY_STATE);

  useEffect(() => {
    if (!evidence) {
      setState(EMPTY_STATE);
      return;
    }
    const currentEvidence = evidence;

    let cancelled = false;

    setState((prev) => ({
      ...prev,
      errors: [],
      sigResults: {},
      proposer: null,
      targetWarnings: [],
      hashDetails: undefined,
      hashMatch: true,
      policyProof: undefined,
      simulationVerification: undefined,
      simulationReplayVerification: undefined,
      consensusVerification: undefined,
      consensusSourceSummary: currentEvidence.consensusProof
        ? "Consensus proof included but not yet verified (requires desktop app)."
        : "",
      consensusTrustDecisionReason: undefined,
    }));

    async function verifyAll() {
      try {
        const report = await verifyEvidencePackage(currentEvidence, {
          settings,
        });

        if (cancelled) return;

        const initialConsensusSource = report.sources.find(
          (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
        );

        setState((prev) => ({
          ...prev,
          errors: [],
          sigResults: report.signatures.byOwner,
          proposer: report.proposer,
          targetWarnings: report.targetWarnings,
          hashDetails: report.hashDetails,
          hashMatch: report.hashMatch,
          policyProof: report.policyProof,
          simulationVerification: report.simulationVerification,
          simulationReplayVerification: undefined,
          consensusSourceSummary: initialConsensusSource?.summary ?? prev.consensusSourceSummary,
          consensusTrustDecisionReason:
            report.consensusTrustDecisionReason ?? undefined,
        }));

        const replayResult =
          currentEvidence.simulation && currentEvidence.simulationWitness
            ? await invoke<SimulationReplayVerificationResult>(
                "verify_simulation_replay",
                {
                  input: {
                    chainId: currentEvidence.chainId,
                    safeAddress: currentEvidence.safeAddress,
                    transaction: currentEvidence.transaction,
                    simulation: currentEvidence.simulation,
                    simulationWitness: currentEvidence.simulationWitness,
                  } satisfies SimulationReplayVerifyInput,
                }
              ).catch((err) =>
                createSimulationReplayExecErrorResult(
                  err instanceof Error ? err.message : String(err)
                )
              )
            : undefined;

        const withReplay = replayResult
          ? applySimulationReplayVerificationToReport(report, currentEvidence, {
              settings,
              simulationReplayVerification: replayResult,
            })
          : report;

        if (!cancelled && replayResult) {
          setState((prev) => ({
            ...prev,
            simulationReplayVerification: replayResult,
          }));
        }

        if (!currentEvidence.consensusProof) return;

        const expectedStateRoot = currentEvidence.onchainPolicyProof?.stateRoot;
        const consensusResult = !expectedStateRoot
          ? createConsensusFailureResult(
              "Consensus proof cannot be independently verified: missing onchainPolicyProof.stateRoot.",
              "missing-policy-state-root"
            )
          : await invoke<ConsensusVerificationResult>("verify_consensus_proof", {
              input: {
                ...currentEvidence.consensusProof,
                expectedStateRoot,
                packageChainId: currentEvidence.chainId,
                packagePackagedAt: currentEvidence.packagedAt,
              } satisfies ConsensusProofVerifyInput,
            }).catch((err) =>
              createConsensusFailureResult(
                err instanceof Error ? err.message : String(err),
                "tauri-invoke-failed"
              )
            );

        const upgradedReport = applyConsensusVerificationToReport(withReplay, currentEvidence, {
          settings,
          consensusVerification: consensusResult,
        });
        const consensusSource = upgradedReport.sources.find(
          (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
        );

        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            consensusVerification: consensusResult,
            consensusSourceSummary: consensusSource?.summary ?? prev.consensusSourceSummary,
            consensusTrustDecisionReason:
              upgradedReport.consensusTrustDecisionReason ?? undefined,
          }));
        }
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          errors: [err instanceof Error ? err.message : "Verification failed unexpectedly"],
        }));
      }
    }

    verifyAll();

    return () => {
      cancelled = true;
    };
  }, [evidence, settings]);

  return state;
}
