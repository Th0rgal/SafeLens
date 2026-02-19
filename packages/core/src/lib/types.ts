import { z } from "zod";

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

// Safe transaction schema (from Safe API)
export const safeTransactionSchema = z.object({
  safe: addressSchema,
  to: addressSchema,
  value: z.string(),
  data: hexDataSchema.nullable(),
  operation: z.union([z.literal(0), z.literal(1)]),
  gasToken: addressSchema,
  safeTxGas: z.coerce.string(),
  baseGas: z.coerce.string(),
  gasPrice: z.coerce.string(),
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
  "consensus-verified",
  "proof-verified",
  "self-verified",
  "rpc-sourced",
  "api-sourced",
  "user-provided",
]);

export type TrustClassification = z.infer<typeof trustClassificationSchema>;

// Storage proof for a single slot
export const storageProofEntrySchema = z.object({
  key: hashSchema,
  value: hashSchema,
  proof: z.array(hexDataSchema),
});

export type StorageProofEntry = z.infer<typeof storageProofEntrySchema>;

// Account proof from eth_getProof
export const accountProofSchema = z.object({
  address: addressSchema,
  balance: z.string(),
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

// State diff entry
export const stateDiffEntrySchema = z.object({
  address: addressSchema,
  key: hashSchema,
  before: hashSchema,
  after: hashSchema,
});

export type StateDiffEntry = z.infer<typeof stateDiffEntrySchema>;

// Consensus proof section (Phase 4 — Helios light client verification)
// Contains beacon chain light client data that allows offline BLS verification
// of the state root against Ethereum consensus.
export const consensusProofSchema = z.object({
  /** Beacon block root used as the bootstrap checkpoint */
  checkpoint: hashSchema,
  /** JSON-serialized light client bootstrap (sync committee + beacon header) */
  bootstrap: z.string(),
  /** JSON-serialized light client updates (sync committee period transitions) */
  updates: z.array(z.string()),
  /** JSON-serialized light client finality update (BLS-signed finalized header) */
  finalityUpdate: z.string(),
  /** Network identifier for selecting the correct fork config and genesis root */
  network: z.enum(["mainnet", "sepolia", "holesky", "gnosis"]),
  /** The EVM execution state root extracted from the finalized header */
  stateRoot: hashSchema,
  /** Block number of the finalized execution payload */
  blockNumber: z.number(),
  /** Beacon slot of the finalized header in the finality update. */
  finalizedSlot: z.number(),
});

export type ConsensusProof = z.infer<typeof consensusProofSchema>;

// Simulation section (Phase 3 will populate these)
export const simulationSchema = z.object({
  success: z.boolean(),
  returnData: hexDataSchema.nullable(),
  gasUsed: z.string(),
  logs: z.array(simulationLogSchema),
  stateDiffs: z.array(stateDiffEntrySchema).optional(),
  blockNumber: z.number(),
  trust: trustClassificationSchema,
});

export type Simulation = z.infer<typeof simulationSchema>;

// Evidence package schema
export const evidencePackageSchema = z.object({
  version: z.union([z.literal("1.0"), z.literal("1.1"), z.literal("1.2")]),
  safeAddress: addressSchema,
  safeTxHash: hashSchema,
  chainId: z.number(),
  transaction: z.object({
    to: addressSchema,
    value: z.string(),
    data: hexDataSchema.nullable(),
    operation: z.union([z.literal(0), z.literal(1)]),
    nonce: z.number(),
    safeTxGas: z.string(),
    baseGas: z.string(),
    gasPrice: z.string(),
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
  consensusProof: consensusProofSchema.optional(),
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
