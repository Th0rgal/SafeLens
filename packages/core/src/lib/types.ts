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

// Evidence package schema
export const evidencePackageSchema = z.object({
  version: z.literal("1.0"),
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
