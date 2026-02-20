import type { TrustLevel } from "./types";
import {
  summarizeConsensusTrustDecisionReason,
  type ConsensusTrustDecisionReason,
} from "../verify/consensus-trust";
import type { ConsensusMode } from "../types";

export type VerificationSourceStatus = "enabled" | "disabled";

export const GENERATION_SOURCE_IDS = {
  SAFE_URL_INPUT: "safe-url-input",
  SAFE_API_RESPONSE: "safe-api-response",
  PACKAGED_AT_TIMESTAMP: "packaged-at-timestamp",
  EXPORTED_JSON: "exported-json",
} as const;

export type GenerationSourceId =
  (typeof GENERATION_SOURCE_IDS)[keyof typeof GENERATION_SOURCE_IDS];

export const VERIFICATION_SOURCE_IDS = {
  EVIDENCE_PACKAGE: "evidence-package",
  HASH_RECOMPUTE: "hash-recompute",
  SIGNATURES: "signatures",
  SIGNATURE_SCHEME_COVERAGE: "signature-scheme-coverage",
  SAFE_OWNERS_THRESHOLD: "safe-owners-threshold",
  ONCHAIN_POLICY_PROOF: "onchain-policy-proof",
  DECODED_CALLDATA: "decoded-calldata",
  SIMULATION: "simulation",
  CONSENSUS_PROOF: "consensus-proof",
  SETTINGS: "settings",
} as const;

export type VerificationSourceId =
  (typeof VERIFICATION_SOURCE_IDS)[keyof typeof VERIFICATION_SOURCE_IDS];

export type SourceId = GenerationSourceId | VerificationSourceId;

export interface VerificationSource {
  id: SourceId;
  title: string;
  trust: TrustLevel;
  summary: string;
  detail: string;
  status: VerificationSourceStatus;
}

export interface VerificationSourceContext {
  hasSettings: boolean;
  hasUnsupportedSignatures: boolean;
  hasDecodedData: boolean;
  hasOnchainPolicyProof: boolean;
  hasSimulation: boolean;
  hasConsensusProof: boolean;
  onchainPolicyProofTrust?: TrustLevel;
  simulationTrust?: TrustLevel;
  consensusVerified?: boolean;
  consensusTrustDecisionReason?: ConsensusTrustDecisionReason;
  consensusMode?: ConsensusMode;
}

export const DEFAULT_VERIFICATION_SOURCE_CONTEXT: VerificationSourceContext = {
  hasSettings: false,
  hasUnsupportedSignatures: false,
  hasDecodedData: false,
  hasOnchainPolicyProof: false,
  hasSimulation: false,
  hasConsensusProof: false,
};

export function createVerificationSourceContext(
  overrides: Partial<VerificationSourceContext>
): VerificationSourceContext {
  return {
    ...DEFAULT_VERIFICATION_SOURCE_CONTEXT,
    ...overrides,
  };
}

/**
 * Build trust assumptions for evidence generation.
 */
export function buildGenerationSources(): VerificationSource[] {
  return [
    {
      id: GENERATION_SOURCE_IDS.SAFE_URL_INPUT,
      title: "Safe URL input",
      trust: "user-provided",
      summary: "Transaction URL is provided by the operator.",
      detail:
        "Assumption: the pasted URL references the intended Safe and transaction hash.",
      status: "enabled",
    },
    {
      id: GENERATION_SOURCE_IDS.SAFE_API_RESPONSE,
      title: "Safe Transaction Service response",
      trust: "api-sourced",
      summary: "Transaction payload and confirmations come from Safe API.",
      detail:
        "Assumption: HTTPS/TLS and Safe API response are correct for the requested safeTxHash.",
      status: "enabled",
    },
    {
      id: GENERATION_SOURCE_IDS.PACKAGED_AT_TIMESTAMP,
      title: "Package timestamp",
      trust: "user-provided",
      summary: "packagedAt is generated from local system time.",
      detail:
        "Assumption: the generator machine clock is accurate enough for your audit trail.",
      status: "enabled",
    },
    {
      id: GENERATION_SOURCE_IDS.EXPORTED_JSON,
      title: "Evidence export",
      trust: "self-verified",
      summary: "Exported JSON is deterministic from fetched payload.",
      detail:
        "Assumption: none beyond local runtime integrity. The app writes exactly the generated package content.",
      status: "enabled",
    },
  ];
}

/**
 * Build a shared list of verification sources used by both CLI and UI.
 * The result is stable so tests and docs can rely on the same wording.
 */
export function buildVerificationSources(
  context: VerificationSourceContext
): VerificationSource[] {
  const consensusFailureReason = summarizeConsensusTrustDecisionReason(
    context.consensusTrustDecisionReason
  );
  const consensusMode = context.consensusMode ?? "beacon";
  const consensusDisplayByMode: Record<ConsensusMode, { name: string; verificationType: string }> = {
    beacon: {
      name: "Beacon",
      verificationType: "BLS sync committee signatures",
    },
    opstack: {
      name: "OP Stack",
      verificationType: "rollup consensus commitments",
    },
    linea: {
      name: "Linea",
      verificationType: "chain-specific consensus attestations",
    },
  };
  const consensusDisplay = consensusDisplayByMode[consensusMode];
  const consensusVerifiedTrustByMode: Record<ConsensusMode, TrustLevel> = {
    beacon: "consensus-verified-beacon",
    opstack: "consensus-verified-opstack",
    linea: "consensus-verified-linea",
  };
  const verifiedConsensusTrust =
    consensusVerifiedTrustByMode[consensusMode] ?? "consensus-verified";

  return [
    {
      id: VERIFICATION_SOURCE_IDS.EVIDENCE_PACKAGE,
      title: "Evidence package integrity",
      trust: "self-verified",
      summary: "Parsed and schema-validated locally.",
      detail:
        "Assumption: none beyond local parser/runtime integrity. Invalid JSON or invalid schema data is rejected before verification.",
      status: "enabled",
    },
    {
      id: VERIFICATION_SOURCE_IDS.HASH_RECOMPUTE,
      title: "Safe tx hash",
      trust: "self-verified",
      summary: "Recomputed in your session.",
      detail:
        "Assumption: none beyond local hashing implementation integrity. The hash is recomputed from tx fields and must match evidence.safeTxHash.",
      status: "enabled",
    },
    {
      id: VERIFICATION_SOURCE_IDS.SIGNATURES,
      title: "Signature checks",
      trust: "self-verified",
      summary: "Each signature is verified offline.",
      detail:
        "Assumption: claimed owners in the package are honest labels. Verification proves each signature recovers the claimed owner for safeTxHash.",
      status: "enabled",
    },
    context.hasUnsupportedSignatures
      ? {
          id: VERIFICATION_SOURCE_IDS.SIGNATURE_SCHEME_COVERAGE,
          title: "Signature scheme coverage",
          trust: "api-sourced",
          summary: "Unsupported signature scheme detected.",
          detail:
            "Assumption: at least one signature uses a scheme not verified here (for example contract signatures or pre-approved hashes).",
          status: "enabled",
        }
      : {
          id: VERIFICATION_SOURCE_IDS.SIGNATURE_SCHEME_COVERAGE,
          title: "Signature scheme coverage",
          trust: "self-verified",
          summary: "All signatures are locally verifiable EOA schemes.",
          detail:
            "Assumption: none additional. No contract signature (v=0) or pre-approved hash (v=1) entries were detected.",
          status: "disabled",
        },
    context.hasOnchainPolicyProof
      ? {
          id: VERIFICATION_SOURCE_IDS.SAFE_OWNERS_THRESHOLD,
          title: "Safe owners and threshold",
          trust: context.onchainPolicyProofTrust ?? "rpc-sourced",
          summary:
            "Owner set and threshold verified against on-chain storage proofs.",
          detail:
            "On-chain Merkle storage proofs confirm owners, threshold, nonce, modules, guard, fallback handler, and singleton at a pinned block.",
          status: "enabled" as VerificationSourceStatus,
        }
      : {
          id: VERIFICATION_SOURCE_IDS.SAFE_OWNERS_THRESHOLD,
          title: "Safe owners and threshold",
          trust: "api-sourced" as TrustLevel,
          summary: "Owner set and threshold are accepted from evidence.",
          detail:
            "Assumption: confirmations and confirmationsRequired in the package reflect the Safe's real policy for this transaction.",
          status: "enabled" as VerificationSourceStatus,
        },
    context.hasOnchainPolicyProof
      ? {
          id: VERIFICATION_SOURCE_IDS.ONCHAIN_POLICY_PROOF,
          title: "On-chain policy proof",
          trust: context.onchainPolicyProofTrust ?? "rpc-sourced",
          summary:
            "Safe policy verified via eth_getProof Merkle storage proofs.",
          detail:
            "Storage proofs for owners, threshold, nonce, modules, guard, fallback handler, and singleton are verified against the provided state root.",
          status: "enabled" as VerificationSourceStatus,
        }
      : {
          id: VERIFICATION_SOURCE_IDS.ONCHAIN_POLICY_PROOF,
          title: "On-chain policy proof",
          trust: "api-sourced" as TrustLevel,
          summary:
            "No on-chain policy proof included. Safe policy is api-sourced.",
          detail:
            "Without storage proofs, the Safe's owners, threshold, and configuration are trusted from the API response. Enable proof generation to upgrade this to proof-verified.",
          status: "disabled" as VerificationSourceStatus,
        },
    context.hasDecodedData
      ? {
          id: VERIFICATION_SOURCE_IDS.DECODED_CALLDATA,
          title: "Decoded calldata",
          trust: "api-sourced",
          summary: "Decoded calldata is API-provided metadata.",
          detail:
            "Assumption: decoded method names/arguments are informational and may be wrong. Raw calldata and hash checks remain authoritative.",
          status: "enabled",
        }
      : {
          id: VERIFICATION_SOURCE_IDS.DECODED_CALLDATA,
          title: "Decoded calldata",
          trust: "api-sourced",
          summary: "No decoded calldata was included in evidence.",
          detail:
            "Assumption: none for decoded metadata because this package contains only raw calldata.",
          status: "disabled",
        },
    context.hasSimulation
      ? {
          id: VERIFICATION_SOURCE_IDS.SIMULATION,
          title: "Transaction simulation",
          trust: context.simulationTrust ?? "rpc-sourced",
          summary:
            "Transaction simulated via execTransaction with state overrides.",
          detail:
            "Simulation was run using storage-override technique. Trust level depends on how the simulation was sourced: rpc-sourced if from a standard RPC, proof-verified if backed by consensus proofs.",
          status: "enabled" as VerificationSourceStatus,
        }
      : {
          id: VERIFICATION_SOURCE_IDS.SIMULATION,
          title: "Transaction simulation",
          trust: "rpc-sourced" as TrustLevel,
          summary: "No simulation included in evidence.",
          detail:
            "Without simulation data, the transaction's execution outcome is unknown until it is signed and broadcast.",
          status: "disabled" as VerificationSourceStatus,
        },
    context.hasConsensusProof
      ? {
          id: VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF,
          title: "Consensus verification",
          trust: context.consensusVerified ? verifiedConsensusTrust : ("rpc-sourced" as TrustLevel),
          summary: context.consensusVerified
            ? `State root verified against ${consensusDisplay.name} consensus via ${consensusDisplay.verificationType}.`
            : consensusFailureReason
              ? `Consensus proof included but not yet verified (${consensusFailureReason}).`
              : `Consensus proof (${consensusDisplay.name}) included but not yet verified (requires desktop app).`,
          detail: context.consensusVerified
            ? `The state root used in policy proofs has been cryptographically verified against ${consensusDisplay.name} consensus data.`
            : consensusFailureReason
              ? `Consensus trust was not upgraded because ${consensusFailureReason}.`
              : `The evidence package contains ${consensusDisplay.name} consensus data. Verification requires the desktop app's Helios-based verifier.`,
          status: "enabled" as VerificationSourceStatus,
        }
      : {
          id: VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF,
          title: "Consensus verification",
          trust: "rpc-sourced" as TrustLevel,
          summary: "No consensus proof included. State root is RPC-trusted.",
          detail:
            "Without consensus verification, the state root in policy proofs is trusted from the RPC provider. Generate evidence with a beacon chain RPC to upgrade this.",
          status: "disabled" as VerificationSourceStatus,
        },
    context.hasSettings
      ? {
          id: VERIFICATION_SOURCE_IDS.SETTINGS,
          title: "Address and contract labels",
          trust: "user-provided",
          summary: "Resolved from your local settings file.",
          detail:
            "Assumption: your settings file is correct. Labels, chain names, and warning enrichment are user-controlled metadata.",
          status: "enabled",
        }
      : {
          id: VERIFICATION_SOURCE_IDS.SETTINGS,
          title: "Address and contract labels",
          trust: "api-sourced",
          summary: "No local settings file was used.",
          detail:
            "Assumption: none for local labeling. Targets/signers remain unlabeled, while cryptographic checks still run locally.",
          status: "disabled",
        },
  ];
}
