import { analyzeTarget, identifyProposer, type TransactionWarning } from "../warnings/analyze";
import type { EvidencePackage } from "../types";
import { verifySignature, type SignatureCheckResult } from "../safe/signatures";
import { computeSafeTxHashDetailed, type SafeTxHashDetails } from "../safe/hash";
import { verifyPolicyProof, type PolicyProofVerificationResult } from "../proof";
import { verifySimulation, type SimulationVerificationResult } from "../simulation";
import type { SettingsConfig } from "../settings/types";
import type { Address, Hash, Hex } from "viem";
import { buildVerificationSources, createVerificationSourceContext } from "../trust";

export type SignatureCheckSummary = {
  total: number;
  valid: number;
  invalid: number;
  unsupported: number;
};

export type SignatureCheckEntry = {
  owner: string;
  result: SignatureCheckResult;
};

export type SignatureCheckBundle = {
  list: SignatureCheckEntry[];
  byOwner: Record<string, SignatureCheckResult>;
  summary: SignatureCheckSummary;
};

export type ConsensusVerificationResult = {
  valid: boolean;
  verified_state_root: string | null;
  verified_block_number: number | null;
  state_root_matches: boolean;
  sync_committee_participants: number;
  error: string | null;
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    detail: string | null;
  }>;
};

export type EvidenceVerificationReport = {
  proposer: string | null;
  targetWarnings: TransactionWarning[];
  signatures: SignatureCheckBundle;
  sources: ReturnType<typeof buildVerificationSources>;
  hashDetails?: SafeTxHashDetails;
  /** Whether the recomputed safeTxHash matches the one stored in the evidence package. */
  hashMatch: boolean;
  policyProof?: PolicyProofVerificationResult;
  simulationVerification?: SimulationVerificationResult;
  /** Consensus verification result (from Tauri backend, if available). */
  consensusVerification?: ConsensusVerificationResult;
};

export interface VerifyEvidenceOptions {
  settings?: SettingsConfig | null;
}

interface BuildReportSourcesOptions {
  evidence: EvidencePackage;
  settings?: SettingsConfig | null;
  signatureSummary: SignatureCheckSummary;
  policyProof?: PolicyProofVerificationResult;
  consensusVerification?: ConsensusVerificationResult;
}

function isConsensusVerificationTrusted(
  evidence: EvidencePackage,
  consensusVerification?: ConsensusVerificationResult
): boolean {
  if (!consensusVerification?.valid) {
    return false;
  }
  if (!evidence.consensusProof || !evidence.onchainPolicyProof) {
    return false;
  }

  const verifiedStateRoot = consensusVerification.verified_state_root;
  const verifiedBlockNumber = consensusVerification.verified_block_number;
  if (!verifiedStateRoot || verifiedBlockNumber == null) {
    return false;
  }

  const expectedStateRoot = evidence.onchainPolicyProof.stateRoot;
  const expectedBlockNumber = evidence.onchainPolicyProof.blockNumber;
  const rootMatches =
    verifiedStateRoot.toLowerCase() === expectedStateRoot.toLowerCase();
  const blockMatches = verifiedBlockNumber === expectedBlockNumber;
  return consensusVerification.state_root_matches && rootMatches && blockMatches;
}

function buildReportSources(
  options: BuildReportSourcesOptions
): ReturnType<typeof buildVerificationSources> {
  return buildVerificationSources(createVerificationSourceContext({
    hasSettings: Boolean(options.settings),
    hasUnsupportedSignatures: options.signatureSummary.unsupported > 0,
    hasDecodedData: Boolean(options.evidence.dataDecoded),
    hasOnchainPolicyProof: Boolean(options.evidence.onchainPolicyProof),
    hasSimulation: Boolean(options.evidence.simulation),
    hasConsensusProof: Boolean(options.evidence.consensusProof),
    // After successful local Merkle verification, upgrade trust from
    // "rpc-sourced" to "proof-verified" — the proof was cryptographically
    // validated against the state root, not just fetched from an RPC.
    onchainPolicyProofTrust: options.policyProof?.valid
      ? "proof-verified"
      : options.evidence.onchainPolicyProof?.trust,
    simulationTrust: options.evidence.simulation?.trust,
    consensusVerified: isConsensusVerificationTrusted(
      options.evidence,
      options.consensusVerification
    ),
  }));
}

export function applyConsensusVerificationToReport(
  report: EvidenceVerificationReport,
  evidence: EvidencePackage,
  options: VerifyEvidenceOptions & {
    consensusVerification: ConsensusVerificationResult;
  }
): EvidenceVerificationReport {
  return {
    ...report,
    consensusVerification: options.consensusVerification,
    sources: buildReportSources({
      evidence,
      settings: options.settings,
      signatureSummary: report.signatures.summary,
      policyProof: report.policyProof,
      consensusVerification: options.consensusVerification,
    }),
  };
}

export async function verifyEvidencePackage(
  evidence: EvidencePackage,
  options: VerifyEvidenceOptions = {}
): Promise<EvidenceVerificationReport> {
  const { settings } = options;

  const proposer = identifyProposer(evidence.confirmations);
  const targetWarnings = settings
    ? analyzeTarget(
        evidence.transaction.to,
        evidence.transaction.operation,
        settings,
        evidence.chainId
      )
    : [];

  // Recompute the safeTxHash from the transaction fields FIRST, so
  // signatures are always verified against the locally-computed hash —
  // not the one stored in the evidence JSON. This prevents a tampered
  // safeTxHash field from causing forged signatures to pass.
  const hashDetails = computeSafeTxHashDetailed({
    safeAddress: evidence.safeAddress as Address,
    chainId: evidence.chainId,
    to: evidence.transaction.to as Address,
    value: BigInt(evidence.transaction.value),
    data: (evidence.transaction.data ?? "0x") as Hex,
    operation: evidence.transaction.operation,
    safeTxGas: BigInt(evidence.transaction.safeTxGas),
    baseGas: BigInt(evidence.transaction.baseGas),
    gasPrice: BigInt(evidence.transaction.gasPrice),
    gasToken: evidence.transaction.gasToken as Address,
    refundReceiver: evidence.transaction.refundReceiver as Address,
    nonce: evidence.transaction.nonce,
  });

  const hashMatch =
    hashDetails.safeTxHash.toLowerCase() ===
    (evidence.safeTxHash as string).toLowerCase();

  // Verify signatures against the RECOMPUTED hash, not evidence.safeTxHash
  const signatureList: SignatureCheckEntry[] = await Promise.all(
    evidence.confirmations.map(async (conf) => ({
      owner: conf.owner,
      result: await verifySignature(
        hashDetails.safeTxHash as Hash,
        conf.signature as Hex,
        conf.owner as Address
      ),
    }))
  );

  const byOwner: Record<string, SignatureCheckResult> = {};
  for (const check of signatureList) {
    byOwner[check.owner] = check.result;
  }

  const summary: SignatureCheckSummary = {
    total: signatureList.length,
    valid: 0,
    invalid: 0,
    unsupported: 0,
  };

  for (const check of signatureList) {
    if (check.result.status === "valid") summary.valid += 1;
    else if (check.result.status === "invalid") summary.invalid += 1;
    else summary.unsupported += 1;
  }

  // Verify on-chain policy proof if present
  let policyProof: PolicyProofVerificationResult | undefined;
  if (evidence.onchainPolicyProof) {
    policyProof = verifyPolicyProof(
      evidence.onchainPolicyProof,
      evidence.safeAddress as Address
    );
  }

  // Cross-validate confirmationsRequired against proof-verified threshold.
  // If the policy proof is valid, its decodedPolicy.threshold is
  // cryptographically proven.  A mismatch with the evidence-level
  // confirmationsRequired means the evidence lies about how many
  // signatures are needed.
  if (
    policyProof?.valid &&
    evidence.onchainPolicyProof?.decodedPolicy?.threshold != null
  ) {
    const provenThreshold =
      evidence.onchainPolicyProof.decodedPolicy.threshold;
    if (evidence.confirmationsRequired !== provenThreshold) {
      policyProof.checks.push({
        id: "threshold-vs-confirmations",
        label: "confirmationsRequired matches proven threshold",
        passed: false,
        detail: `Evidence claims ${evidence.confirmationsRequired} confirmations required but on-chain threshold is ${provenThreshold}`,
      });
      policyProof.errors.push(
        `confirmationsRequired (${evidence.confirmationsRequired}) does not match proven threshold (${provenThreshold})`
      );
      // The proof is still structurally valid, but this is a data
      // integrity issue — mark the overall proof as invalid so the
      // trust level does not upgrade to "proof-verified".
      policyProof.valid = false;
    }
  }

  // Cross-validate onchain and consensus proofs when both are present.
  // These artifacts must refer to the same finalized execution payload.
  if (policyProof && evidence.onchainPolicyProof && evidence.consensusProof) {
    const onchain = evidence.onchainPolicyProof;
    const consensus = evidence.consensusProof;
    const rootMatches =
      onchain.stateRoot.toLowerCase() === consensus.stateRoot.toLowerCase();
    const blockMatches = onchain.blockNumber === consensus.blockNumber;
    const aligned = rootMatches && blockMatches;

    policyProof.checks.push({
      id: "consensus-proof-alignment",
      label: "onchainPolicyProof aligns with consensusProof finalized root",
      passed: aligned,
      detail: aligned
        ? `Aligned at block ${onchain.blockNumber} (${onchain.stateRoot})`
        : `onchainPolicyProof(${onchain.blockNumber}, ${onchain.stateRoot}) vs consensusProof(${consensus.blockNumber}, ${consensus.stateRoot})`,
    });

    if (!aligned) {
      policyProof.errors.push(
        "onchainPolicyProof does not align with consensusProof finalized root/block."
      );
      policyProof.valid = false;
    }
  }

  // Verify simulation if present
  let simulationVerification: SimulationVerificationResult | undefined;
  if (evidence.simulation) {
    simulationVerification = verifySimulation(evidence.simulation);
  }

  return {
    proposer,
    targetWarnings,
    sources: buildReportSources({
      evidence,
      settings,
      signatureSummary: summary,
      policyProof,
    }),
    signatures: {
      list: signatureList,
      byOwner,
      summary,
    },
    hashDetails,
    hashMatch,
    policyProof,
    simulationVerification,
  };
}
