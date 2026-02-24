import type {
  EvidencePackage,
  EvidenceExportContract,
  ExportContractReason,
  SafeTransaction,
} from "../types";
import type { Address } from "viem";
import { getSafeApiUrl } from "../safe/url-parser";
import { getNetworkCapability } from "../networks/capabilities";
import {
  fetchOnchainPolicyProof,
  type FetchOnchainProofOptions,
} from "../proof";
import {
  fetchSimulation,
  fetchSimulationWitness,
  type FetchSimulationOptions,
} from "../simulation";
import { computeSimulationDigest } from "../simulation/witness-verifier";
import {
  fetchConsensusProof,
  type FetchConsensusProofOptions,
} from "../consensus";

export const PROOF_ALIGNMENT_ERROR_CODE = "proof-alignment-mismatch" as const;

/**
 * Thrown when on-chain policy proof and consensus proof do not refer to the
 * same finalized execution payload root/block pair.
 */
export class ProofAlignmentError extends Error {
  readonly code = PROOF_ALIGNMENT_ERROR_CODE;
  readonly onchainStateRoot: string;
  readonly onchainBlockNumber: number;
  readonly consensusStateRoot: string;
  readonly consensusBlockNumber: number;

  constructor(params: {
    onchainStateRoot: string;
    onchainBlockNumber: number;
    consensusStateRoot: string;
    consensusBlockNumber: number;
  }) {
    const {
      onchainStateRoot,
      onchainBlockNumber,
      consensusStateRoot,
      consensusBlockNumber,
    } = params;
    super(
      `Proof alignment mismatch: onchainPolicyProof(${onchainBlockNumber}, ${onchainStateRoot}) != consensusProof(${consensusBlockNumber}, ${consensusStateRoot}). Both artifacts must refer to the same finalized chain point.`
    );
    this.name = "ProofAlignmentError";
    this.onchainStateRoot = onchainStateRoot;
    this.onchainBlockNumber = onchainBlockNumber;
    this.consensusStateRoot = consensusStateRoot;
    this.consensusBlockNumber = consensusBlockNumber;
  }
}

/**
 * Create an evidence package from a Safe transaction
 */
export function createEvidencePackage(
  transaction: SafeTransaction,
  chainId: number,
  transactionUrl: string
): EvidencePackage {
  const evidence: EvidencePackage = {
    version: "1.0",
    safeAddress: transaction.safe,
    safeTxHash: transaction.safeTxHash,
    chainId,
    transaction: {
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
      operation: transaction.operation,
      nonce: transaction.nonce,
      safeTxGas: transaction.safeTxGas,
      baseGas: transaction.baseGas,
      gasPrice: transaction.gasPrice,
      gasToken: transaction.gasToken,
      refundReceiver: transaction.refundReceiver,
    },
    confirmations: transaction.confirmations.map((c) => ({
      owner: c.owner,
      signature: c.signature,
      submissionDate: c.submissionDate,
    })),
    confirmationsRequired: transaction.confirmationsRequired,
    ethereumTxHash: transaction.transactionHash,
    dataDecoded: transaction.dataDecoded ?? null,
    sources: {
      safeApiUrl: getSafeApiUrl(chainId),
      transactionUrl,
    },
    packagedAt: new Date().toISOString(),
  };

  return evidence;
}

/**
 * Enrich an evidence package with an on-chain policy proof.
 *
 * Fetches `eth_getProof` for the Safe at a finalized (or specified) block,
 * walks the owner/module linked lists, and attaches the result as
 * `onchainPolicyProof`. Bumps version to "1.1".
 */
export async function enrichWithOnchainProof(
  evidence: EvidencePackage,
  options: FetchOnchainProofOptions = {}
): Promise<EvidencePackage> {
  const blockNumber = options.blockNumber ?? evidence.consensusProof?.blockNumber;
  const proof = await fetchOnchainPolicyProof(
    evidence.safeAddress as Address,
    evidence.chainId,
    {
      ...options,
      blockNumber,
    }
  );

  if (evidence.consensusProof) {
    assertProofAlignment(proof.stateRoot, proof.blockNumber, evidence.consensusProof.stateRoot, evidence.consensusProof.blockNumber);
  }

  return {
    ...evidence,
    version: withEnrichmentVersion(evidence.version),
    onchainPolicyProof: proof,
  };
}

/**
 * Enrich an evidence package with a transaction simulation.
 *
 * Simulates `execTransaction` via `eth_call` with storage overrides
 * (fake 1-of-1 owner) to reveal the transaction's success/revert status,
 * return data, gas usage, and event logs. Bumps version to "1.1".
 */
export interface EnrichWithSimulationResult {
  evidence: EvidencePackage;
  /** When witness generation fails, the normalized error message is preserved
   *  here so callers can thread it into `finalizeEvidenceExport` diagnostics. */
  witnessGenerationError?: string;
}

export async function enrichWithSimulation(
  evidence: EvidencePackage,
  options: FetchSimulationOptions = {}
): Promise<EnrichWithSimulationResult> {
  const simulation = await fetchSimulation(
    evidence.safeAddress as Address,
    evidence.chainId,
    evidence.transaction,
    options
  );

  let simulationWitness: EvidencePackage["simulationWitness"] | undefined;
  let witnessGenerationError: string | undefined;
  try {
    simulationWitness = await fetchSimulationWitness(
      evidence.safeAddress as Address,
      evidence.chainId,
      evidence.transaction,
      simulation,
      options
    );
  } catch (error: unknown) {
    // Witness generation is best-effort: keep simulation artifact even when
    // RPC cannot provide proof data for witness construction.
    // Preserve the failure reason so downstream tooling can diagnose why.
    // Redact URL-like fragments to prevent API key leakage in diagnostics.
    simulationWitness = undefined;
    const rawMessage =
      error instanceof Error
        ? error.message || "(empty error message)"
        : typeof error === "string" && error.length > 0
          ? error
          : "(unknown error)";
    witnessGenerationError = rawMessage.replace(
      /https?:\/\/[^\s"',)}\]]+/gi,
      (url) => {
        try {
          const parsed = new URL(url);
          return `${parsed.protocol}//${parsed.hostname}/***`;
        } catch {
          return "[redacted-url]";
        }
      }
    );
  }

  const hasReplayAccounts =
    Array.isArray(simulationWitness?.replayAccounts) &&
    simulationWitness.replayAccounts.length > 0;
  const hasReplayBlockContext = Boolean(simulationWitness?.replayBlock);
  const hasReplaySupportedOperation = evidence.transaction.operation === 0;
  const useWitnessOnlySimulation =
    hasReplaySupportedOperation && hasReplayAccounts && hasReplayBlockContext;
  // Keep RPC simulation effects in the package for UI comparison against
  // offline replay results. Witness-only trust decisions are still enforced
  // by desktop/CLI using simulationWitness + local replay verification.
  const packagedSimulation = simulation;
  const packagedSimulationWitness = useWitnessOnlySimulation
    ? {
        ...simulationWitness!,
        // Keep digest aligned with packaged simulation.
        simulationDigest: computeSimulationDigest(packagedSimulation),
        witnessOnly: true,
      }
    : simulationWitness;

  return {
    evidence: {
      ...evidence,
      version: withEnrichmentVersion(evidence.version),
      simulation: packagedSimulation,
      simulationWitness: packagedSimulationWitness,
    },
    witnessGenerationError,
  };
}

/**
 * Enrich an evidence package with a consensus proof (Phase 4).
 *
 * Fetches light client data from a beacon chain RPC: bootstrap,
 * sync committee updates, and a finality update. These allow the
 * desktop verifier to cryptographically verify the state root against
 * Ethereum consensus (BLS sync committee signatures) without trusting
 * any RPC provider. Bumps version to "1.2".
 */
export async function enrichWithConsensusProof(
  evidence: EvidencePackage,
  options: FetchConsensusProofOptions = {}
): Promise<EvidencePackage> {
  const consensusProof = await fetchConsensusProof(
    evidence.chainId,
    options
  );

  if (evidence.onchainPolicyProof) {
    assertProofAlignment(
      evidence.onchainPolicyProof.stateRoot,
      evidence.onchainPolicyProof.blockNumber,
      consensusProof.stateRoot,
      consensusProof.blockNumber
    );
  }

  return {
    ...evidence,
    version: "1.2",
    consensusProof,
  };
}

/**
 * Export evidence package as JSON string
 */
export function exportEvidencePackage(evidence: EvidencePackage): string {
  return JSON.stringify(evidence, null, 2);
}

export interface FinalizeExportContractOptions {
  rpcProvided: boolean;
  consensusProofAttempted: boolean;
  consensusProofFailed: boolean;
  consensusProofUnsupportedMode?: boolean;
  consensusProofDisabledByFeatureFlag?: boolean;
  onchainPolicyProofAttempted: boolean;
  onchainPolicyProofFailed: boolean;
  simulationAttempted: boolean;
  simulationFailed: boolean;
  /** Normalized error message from witness generation failure, if any. */
  witnessGenerationError?: string;
}

/**
 * Stamp package export status with explicit machine-readable completeness data.
 * A package is "fully-verifiable" only when consensus proof, on-chain policy
 * proof, simulation artifact, and replay-capable simulation witness inputs
 * (accounts + pinned block context) are all present. All other states are
 * partial.
 */
export function finalizeEvidenceExport(
  evidence: EvidencePackage,
  options: FinalizeExportContractOptions
): EvidencePackage {
  const consensusMode = getNetworkCapability(evidence.chainId)?.consensusMode;
  const hasConsensusProofArtifact = Boolean(evidence.consensusProof);
  const proofConsensusMode = evidence.consensusProof?.consensusMode ?? "beacon";
  // Only beacon mode provides independent cryptographic verification (BLS
  // sync committee signatures). OP Stack/Linea envelopes are RPC-sourced
  // header reads without an independent trust boundary, so they must not
  // promote packages to fully-verifiable.
  const hasVerifierSupportedConsensusProof =
    hasConsensusProofArtifact && proofConsensusMode === "beacon";
  const hasOnchainPolicyProof = Boolean(evidence.onchainPolicyProof);
  const hasSimulation = Boolean(evidence.simulation);
  const hasSimulationWitnessReplayInputs =
    Array.isArray(evidence.simulationWitness?.replayAccounts) &&
    evidence.simulationWitness.replayAccounts.length > 0 &&
    Boolean(evidence.simulationWitness.replayBlock);
  const hasReplaySupportedOperation = evidence.transaction.operation === 0;
  const hasReplayCapableSimulationWitnessInputs =
    hasReplaySupportedOperation && hasSimulationWitnessReplayInputs;
  const reasons = new Set<ExportContractReason>();

  if (!hasConsensusProofArtifact) {
    if (!options.consensusProofAttempted) {
      reasons.add("missing-consensus-proof");
    } else if (options.consensusProofDisabledByFeatureFlag) {
      reasons.add("consensus-mode-disabled-by-feature-flag");
    } else if (options.consensusProofUnsupportedMode) {
      reasons.add("unsupported-consensus-mode");
    } else {
      reasons.add(
        options.consensusProofFailed
          ? "consensus-proof-fetch-failed"
          : "missing-consensus-proof"
      );
    }
  } else if (!hasVerifierSupportedConsensusProof) {
    reasons.add("unsupported-consensus-mode");
  }

  if (!hasOnchainPolicyProof) {
    if (!options.rpcProvided || !options.onchainPolicyProofAttempted) {
      reasons.add("missing-rpc-url");
      reasons.add("missing-onchain-policy-proof");
    } else if (options.onchainPolicyProofFailed) {
      reasons.add("policy-proof-fetch-failed");
      reasons.add("missing-onchain-policy-proof");
    } else {
      reasons.add("missing-onchain-policy-proof");
    }
  }

  if (!hasSimulation) {
    if (!options.rpcProvided || !options.simulationAttempted) {
      reasons.add("missing-rpc-url");
      reasons.add("missing-simulation");
    } else if (options.simulationFailed) {
      reasons.add("simulation-fetch-failed");
      reasons.add("missing-simulation");
    } else {
      reasons.add("missing-simulation");
    }
  } else if (!hasReplaySupportedOperation) {
    reasons.add("simulation-replay-unsupported-operation");
  } else if (!hasSimulationWitnessReplayInputs) {
    reasons.add("missing-simulation-witness");
  }

  const isFullyVerifiable =
    hasVerifierSupportedConsensusProof &&
    hasOnchainPolicyProof &&
    hasSimulation &&
    hasReplayCapableSimulationWitnessInputs;
  const diagnostics: EvidenceExportContract["diagnostics"] =
    options.witnessGenerationError !== undefined
      ? { witnessGenerationError: options.witnessGenerationError || "(unknown error)" }
      : undefined;
  const exportContract: EvidenceExportContract = {
    mode: isFullyVerifiable ? "fully-verifiable" : "partial",
    status: isFullyVerifiable ? "complete" : "partial",
    isFullyVerifiable,
    reasons: Array.from(reasons),
    artifacts: {
      consensusProof: hasConsensusProofArtifact,
      onchainPolicyProof: hasOnchainPolicyProof,
      simulation: hasSimulation,
    },
    ...(diagnostics && { diagnostics }),
  };

  return {
    ...evidence,
    exportContract,
  };
}

function assertProofAlignment(
  onchainStateRoot: string,
  onchainBlockNumber: number,
  consensusStateRoot: string,
  consensusBlockNumber: number
): void {
  const rootMatches =
    onchainStateRoot.toLowerCase() === consensusStateRoot.toLowerCase();
  const blockMatches = onchainBlockNumber === consensusBlockNumber;

  if (rootMatches && blockMatches) {
    return;
  }

  throw new ProofAlignmentError({
    onchainStateRoot,
    onchainBlockNumber,
    consensusStateRoot,
    consensusBlockNumber,
  });
}

function withEnrichmentVersion(version: EvidencePackage["version"]): "1.1" | "1.2" {
  return version === "1.2" ? "1.2" : "1.1";
}
