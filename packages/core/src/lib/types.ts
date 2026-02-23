import { z } from "zod";
import { CONSENSUS_NETWORKS } from "./networks/capabilities";

// Ethereum address schema
export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");

// Ethereum hash schema
export const hashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid hash");

// Hex data schema
export const hexDataSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]*$/, "Invalid hex data");

// EVM quantity-like numeric string accepted across package boundaries.
// Supports decimal ("21000") and lowercase-prefixed hex ("0x5208").
export const evmQuantitySchema = z
  .string()
  .regex(/^(?:0x[a-fA-F0-9]+|[0-9]+)$/, "Invalid numeric quantity");

// Storage slot keys from eth_getProof may be compact quantities (e.g. 0x0)
// or fully padded 32-byte words.
export const storageSlotKeySchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]+$/, "Invalid storage slot key")
  .refine((value) => value.length <= 66, "Invalid storage slot key");

// Storage values in eth_getProof are quantities and may be compact.
export const storageValueSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]*$/, "Invalid storage value")
  .refine((value) => value.length <= 66, "Invalid storage value");

// Safe transaction schema (from Safe API)
export const safeTransactionSchema = z.object({
  safe: addressSchema,
  to: addressSchema,
  value: z.coerce.string().pipe(evmQuantitySchema),
  data: hexDataSchema.nullable(),
  operation: z.union([z.literal(0), z.literal(1)]),
  gasToken: addressSchema,
  safeTxGas: z.coerce.string().pipe(evmQuantitySchema),
  baseGas: z.coerce.string().pipe(evmQuantitySchema),
  gasPrice: z.coerce.string().pipe(evmQuantitySchema),
  refundReceiver: addressSchema,
  nonce: z.number(),
  executionDate: z.string().nullable(),
  submissionDate: z.string(),
  modified: z.string(),
  blockNumber: z.number().nullable(),
  transactionHash: hashSchema.nullable(),
  safeTxHash: hashSchema,
  executor: addressSchema.nullable(),
  isExecuted: z.boolean(),
  isSuccessful: z.boolean().nullable(),
  ethGasPrice: z.string().nullable(),
  maxFeePerGas: z.string().nullable(),
  maxPriorityFeePerGas: z.string().nullable(),
  gasUsed: z.number().nullable(),
  fee: z.string().nullable(),
  origin: z.string().nullable(),
  dataDecoded: z.any().nullable(),
  confirmationsRequired: z.number(),
  confirmations: z.array(
    z.object({
      owner: addressSchema,
      submissionDate: z.string(),
      transactionHash: hashSchema.nullable(),
      signature: hexDataSchema,
      signatureType: z.string(),
    })
  ),
  trusted: z.boolean(),
  signatures: hexDataSchema.nullable(),
});

export type SafeTransaction = z.infer<typeof safeTransactionSchema>;

// Trust classification for evidence sections
export const trustClassificationSchema = z.enum([
  // Kept for backward compatibility with previously exported reports.
  "consensus-verified",
  "consensus-verified-beacon",
  "consensus-verified-opstack",
  "consensus-verified-linea",
  "proof-verified",
  "self-verified",
  "rpc-sourced",
  "api-sourced",
  "user-provided",
]);

export type TrustClassification = z.infer<typeof trustClassificationSchema>;

// Consensus verifier mode used by desktop verification.
export const consensusModeSchema = z.enum(["beacon", "opstack", "linea"]);
export type ConsensusMode = z.infer<typeof consensusModeSchema>;

// Storage proof for a single slot
export const storageProofEntrySchema = z.object({
  key: storageSlotKeySchema,
  value: storageValueSchema,
  proof: z.array(hexDataSchema),
});

export type StorageProofEntry = z.infer<typeof storageProofEntrySchema>;

// Account proof from eth_getProof
export const accountProofSchema = z.object({
  address: addressSchema,
  balance: evmQuantitySchema,
  codeHash: hashSchema,
  nonce: z.number(),
  storageHash: hashSchema,
  accountProof: z.array(hexDataSchema),
  storageProof: z.array(storageProofEntrySchema),
});

export type AccountProof = z.infer<typeof accountProofSchema>;

// On-chain policy proof section (Phase 2 will populate these)
export const onchainPolicyProofSchema = z.object({
  blockNumber: z.number(),
  stateRoot: hashSchema,
  accountProof: accountProofSchema,
  decodedPolicy: z.object({
    owners: z.array(addressSchema),
    threshold: z.number(),
    nonce: z.number(),
    modules: z.array(addressSchema),
    guard: addressSchema,
    fallbackHandler: addressSchema,
    singleton: addressSchema,
  }),
  trust: trustClassificationSchema,
});

export type OnchainPolicyProof = z.infer<typeof onchainPolicyProofSchema>;

// Simulation log entry
export const simulationLogSchema = z.object({
  address: addressSchema,
  topics: z.array(hashSchema),
  data: hexDataSchema,
});

export type SimulationLog = z.infer<typeof simulationLogSchema>;

// Native value transfer (ETH, xDAI, etc.) extracted from call trace
export const nativeTransferSchema = z.object({
  from: addressSchema,
  to: addressSchema,
  /** Decimal string in wei. */
  value: z.string(),
});

export type NativeTransfer = z.infer<typeof nativeTransferSchema>;

// State diff entry
export const stateDiffEntrySchema = z.object({
  address: addressSchema,
  key: hashSchema,
  before: hashSchema,
  after: hashSchema,
});

export type StateDiffEntry = z.infer<typeof stateDiffEntrySchema>;

const consensusProofBaseSchema = z.object({
  /** Consensus verifier mode. Beacon is currently implemented in desktop verifier. */
  consensusMode: consensusModeSchema.optional(),
  /** The EVM execution state root extracted from a finalized or verified execution payload. */
  stateRoot: hashSchema,
  /** Block number for the execution payload associated with `stateRoot`. */
  blockNumber: z.number(),
});

// Beacon consensus proof section (Phase 4: Helios light client verification).
// Contains beacon chain light client data that allows offline BLS verification.
const beaconConsensusProofSchema = consensusProofBaseSchema.extend({
  consensusMode: z.literal("beacon").optional(),
  /** Beacon block root used as the bootstrap checkpoint. */
  checkpoint: hashSchema,
  /** JSON-serialized light client bootstrap (sync committee + beacon header). */
  bootstrap: z.string(),
  /** JSON-serialized light client updates (sync committee period transitions). */
  updates: z.array(z.string()),
  /** JSON-serialized light client finality update (BLS-signed finalized header). */
  finalityUpdate: z.string(),
  /** Beacon network identifier for selecting the correct fork config and genesis root. */
  network: z.enum(CONSENSUS_NETWORKS),
  /** Beacon slot of the finalized header in the finality update. */
  finalizedSlot: z.number(),
});

// Non-beacon proof envelope used by OP Stack and Linea integration paths.
// Desktop verifier runs deterministic envelope integrity/root-linkage checks
// for these modes and reports mode-specific consensus trust sources.
const nonBeaconConsensusProofSchema = consensusProofBaseSchema
  .extend({
    consensusMode: z.union([z.literal("opstack"), z.literal("linea")]),
    /** Chain/network identifier consumed by mode-specific verifiers. */
    network: z.string().min(1),
    /** Mode-specific serialized proof payload. */
    proofPayload: z.string(),
  })
  .passthrough();

export const consensusProofSchema = z.union([
  beaconConsensusProofSchema,
  nonBeaconConsensusProofSchema,
]);

export type ConsensusProof = z.infer<typeof consensusProofSchema>;

// Simulation section
export const simulationSchema = z.object({
  success: z.boolean(),
  returnData: hexDataSchema.nullable(),
  gasUsed: evmQuantitySchema,
  logs: z.array(simulationLogSchema),
  nativeTransfers: z.array(nativeTransferSchema).optional(),
  stateDiffs: z.array(stateDiffEntrySchema).optional(),
  blockNumber: z.number(),
  /** RFC3339 timestamp for the block used during simulation, when available. */
  blockTimestamp: z.string().datetime({ offset: true }).optional(),
  /** Whether debug_traceCall was available on the RPC. When false, logs and
   *  nativeTransfers are unavailable (not just empty). */
  traceAvailable: z.boolean().optional(),
  trust: trustClassificationSchema,
});

export type Simulation = z.infer<typeof simulationSchema>;

export const simulationReplayBlockSchema = z.object({
  /** Block timestamp in seconds since Unix epoch. */
  timestamp: evmQuantitySchema,
  /** Block gas limit. */
  gasLimit: evmQuantitySchema,
  /** Block base fee per gas. */
  baseFeePerGas: evmQuantitySchema,
  /** Block beneficiary / coinbase. */
  beneficiary: addressSchema,
  /** Optional randomness beacon value (post-merge). */
  prevRandao: hashSchema.optional(),
  /** Block difficulty / prevrandao fallback for legacy networks. */
  difficulty: evmQuantitySchema.optional(),
});

export type SimulationReplayBlock = z.infer<typeof simulationReplayBlockSchema>;

// Witness artifact for simulation verification.
// This does not include a full execution proof; it anchors simulation context
// to a proven state root and binds the simulation payload with a digest.
export const simulationWitnessSchema = z.object({
  chainId: z.number(),
  safeAddress: addressSchema,
  blockNumber: z.number(),
  stateRoot: hashSchema,
  safeAccountProof: accountProofSchema,
  overriddenSlots: z.array(
    z.object({
      key: storageSlotKeySchema,
      value: storageValueSchema,
    })
  ),
  simulationDigest: hashSchema,
  replayBlock: simulationReplayBlockSchema.optional(),
  replayAccounts: z.array(
    z.object({
      address: addressSchema,
      balance: evmQuantitySchema,
      nonce: z.number().int().nonnegative(),
      code: hexDataSchema,
      storage: z.record(storageSlotKeySchema, storageValueSchema).default({}),
    })
  ).optional(),
  replayCaller: addressSchema.optional(),
  replayGasLimit: z.number().int().positive().optional(),
  /** When true, simulation effects (logs/nativeTransfers) are intentionally
   * omitted from the packaged simulation and must be derived from local replay. */
  witnessOnly: z.boolean().optional(),
});

export type SimulationWitness = z.infer<typeof simulationWitnessSchema>;

// Generator export contract status (explicit full vs partial package mode)
export const exportContractReasonSchema = z.enum([
  "missing-consensus-proof",
  "unsupported-consensus-mode",
  "consensus-mode-disabled-by-feature-flag",
  "opstack-consensus-verifier-pending",
  "linea-consensus-verifier-pending",
  "missing-onchain-policy-proof",
  "missing-rpc-url",
  "consensus-proof-fetch-failed",
  "policy-proof-fetch-failed",
  "simulation-fetch-failed",
  "missing-simulation",
  "missing-simulation-witness",
  "simulation-replay-unsupported-operation",
]);

export type ExportContractReason = z.infer<typeof exportContractReasonSchema>;

export const EXPORT_CONTRACT_REASON_LABELS: Record<ExportContractReason, string> = {
  "missing-consensus-proof": "Consensus proof was not included.",
  "unsupported-consensus-mode":
    "Consensus verification mode for this network is not implemented yet.",
  "consensus-mode-disabled-by-feature-flag":
    "Consensus verification mode for this network is currently disabled by rollout feature flag.",
  "opstack-consensus-verifier-pending":
    "OP Stack envelope checks are included, but full cryptographic consensus verification is still pending.",
  "linea-consensus-verifier-pending":
    "Linea envelope checks are included, but full cryptographic consensus verification is still pending.",
  "missing-onchain-policy-proof": "On-chain policy proof was not included.",
  "missing-rpc-url": "No RPC URL was provided, so proof/simulation enrichment was skipped.",
  "consensus-proof-fetch-failed": "Consensus proof fetch failed.",
  "policy-proof-fetch-failed": "On-chain policy proof fetch failed.",
  "simulation-fetch-failed": "Simulation fetch failed.",
  "missing-simulation": "Simulation result was not included.",
  "missing-simulation-witness":
    "Simulation witness/replay inputs were not included, so simulation cannot be fully verified offline.",
  "simulation-replay-unsupported-operation":
    "Simulation replay currently supports CALL (operation=0) only; DELEGATECALL evidence cannot be fully replay-verified offline.",
};

export function getExportContractReasonLabel(reason: ExportContractReason): string {
  return EXPORT_CONTRACT_REASON_LABELS[reason];
}

export const LEGACY_PENDING_CONSENSUS_EXPORT_REASONS = [
  "opstack-consensus-verifier-pending",
  "linea-consensus-verifier-pending",
] as const satisfies readonly ExportContractReason[];

export type LegacyPendingConsensusExportReason =
  (typeof LEGACY_PENDING_CONSENSUS_EXPORT_REASONS)[number];

export const LEGACY_PENDING_CONSENSUS_EXPORT_REASON_BY_MODE = {
  opstack: "opstack-consensus-verifier-pending",
  linea: "linea-consensus-verifier-pending",
} as const satisfies Record<
  Exclude<ConsensusMode, "beacon">,
  LegacyPendingConsensusExportReason
>;

export function findLegacyPendingConsensusExportReason(
  reasons: readonly ExportContractReason[] | null | undefined
): LegacyPendingConsensusExportReason | null {
  if (!reasons || reasons.length === 0) {
    return null;
  }

  const matched = LEGACY_PENDING_CONSENSUS_EXPORT_REASONS.find((reasonCode) =>
    reasons.includes(reasonCode)
  );
  return matched ?? null;
}

export function getLegacyPendingConsensusExportReasonForMode(
  mode: ConsensusMode | null | undefined
): LegacyPendingConsensusExportReason | null {
  if (!mode || mode === "beacon") {
    return null;
  }

  return LEGACY_PENDING_CONSENSUS_EXPORT_REASON_BY_MODE[mode];
}

export const evidenceExportContractSchema = z.object({
  mode: z.enum(["fully-verifiable", "partial"]),
  status: z.enum(["complete", "partial"]),
  isFullyVerifiable: z.boolean(),
  reasons: z.array(exportContractReasonSchema),
  artifacts: z.object({
    consensusProof: z.boolean(),
    onchainPolicyProof: z.boolean(),
    simulation: z.boolean(),
  }),
});

export type EvidenceExportContract = z.infer<typeof evidenceExportContractSchema>;

// Evidence package schema
export const evidencePackageSchema = z.object({
  version: z.union([z.literal("1.0"), z.literal("1.1"), z.literal("1.2")]),
  safeAddress: addressSchema,
  safeTxHash: hashSchema,
  chainId: z.number(),
  transaction: z.object({
    to: addressSchema,
    value: evmQuantitySchema,
    data: hexDataSchema.nullable(),
    operation: z.union([z.literal(0), z.literal(1)]),
    nonce: z.number(),
    safeTxGas: evmQuantitySchema,
    baseGas: evmQuantitySchema,
    gasPrice: evmQuantitySchema,
    gasToken: addressSchema,
    refundReceiver: addressSchema,
  }),
  confirmations: z.array(
    z.object({
      owner: addressSchema,
      signature: hexDataSchema,
      submissionDate: z.string(),
    })
  ),
  confirmationsRequired: z.number(),
  ethereumTxHash: hashSchema.nullable().optional(),
  dataDecoded: z.any().nullable().optional(),
  onchainPolicyProof: onchainPolicyProofSchema.optional(),
  simulation: simulationSchema.optional(),
  simulationWitness: simulationWitnessSchema.optional(),
  consensusProof: consensusProofSchema.optional(),
  exportContract: evidenceExportContractSchema.optional(),
  sources: z.object({
    safeApiUrl: z.string().url(),
    transactionUrl: z.string().url(),
  }),
  packagedAt: z.string(),
});

export type EvidencePackage = z.infer<typeof evidencePackageSchema>;

// Safe URL parsing result
export interface SafeUrlData {
  chainId: number;
  safeAddress: string;
  safeTxHash: string;
}

// Partial Safe URL data (queue URL without specific transaction)
export interface SafeUrlPartialData {
  chainId: number;
  safeAddress: string;
}

// Discriminated union for flexible URL parsing
export type SafeUrlParseResult =
  | { type: "transaction"; data: SafeUrlData }
  | { type: "queue"; data: SafeUrlPartialData };

// Paginated response from Safe Transaction Service
export const safeTransactionListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(safeTransactionSchema),
});

export type SafeTransactionList = z.infer<typeof safeTransactionListSchema>;
