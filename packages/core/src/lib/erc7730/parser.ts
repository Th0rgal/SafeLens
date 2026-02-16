/**
 * ERC-7730 descriptor parser and validator.
 *
 * Uses Zod for runtime validation of descriptor JSON files.
 */

import { z } from "zod";
import type { ERC7730Descriptor } from "./types";

// ── Zod schemas ─────────────────────────────────────────────────────

const DeploymentSchema = z.object({
  chainId: z.number(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
});

const TokenMetadataSchema = z.object({
  name: z.string(),
  ticker: z.string(),
  decimals: z.number(),
});

const MetadataSchema = z.object({
  owner: z.string(),
  info: z
    .object({
      legalName: z.string().optional(),
      lastUpdate: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  token: TokenMetadataSchema.optional(),
  constants: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  enums: z.record(z.record(z.string())).optional(),
});

const FieldFormatSchema = z.enum([
  "raw",
  "addressName",
  "tokenAmount",
  "amount",
  "date",
  "unit",
  "enum",
  "percentage",
]);

const FieldDefinitionSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    label: z.string(),
    path: z.string().optional(),
    format: FieldFormatSchema.optional(),
    tokenPath: z.string().optional(),
    unit: z.string().optional(),
    enum: z.string().optional(),
    $ref: z.string().optional(),
    params: z.record(z.unknown()).optional(),
  })
);

const FormatEntrySchema = z.object({
  intent: z.string(),
  fields: z.array(FieldDefinitionSchema),
});

const DisplaySchema = z.object({
  formats: z.record(FormatEntrySchema),
  definitions: z.record(FieldDefinitionSchema).optional(),
});

const ContractContextSchema = z.object({
  deployments: z.array(DeploymentSchema),
});

const EIP712ContextSchema = z.object({
  deployments: z.array(DeploymentSchema),
  schemas: z.array(z.unknown()).optional(),
});

const ContextSchema = z.object({
  contract: ContractContextSchema.optional(),
  eip712: EIP712ContextSchema.optional(),
});

export const ERC7730DescriptorSchema = z.object({
  $schema: z.string().optional(),
  context: ContextSchema,
  metadata: MetadataSchema,
  display: DisplaySchema,
  includes: z.string().optional(),
});

// ── Parser functions ────────────────────────────────────────────────

export interface ParseResult {
  success: true;
  descriptor: ERC7730Descriptor;
}

export interface ParseError {
  success: false;
  error: string;
}

/**
 * Parse and validate an ERC-7730 descriptor from JSON.
 */
export function parseDescriptor(
  json: unknown
): ParseResult | ParseError {
  try {
    const result = ERC7730DescriptorSchema.safeParse(json);

    if (!result.success) {
      return {
        success: false,
        error: `Invalid ERC-7730 descriptor: ${result.error.message}`,
      };
    }

    return {
      success: true,
      descriptor: result.data as ERC7730Descriptor,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Parse an ERC-7730 descriptor from a JSON string.
 */
export function parseDescriptorFromString(
  jsonString: string
): ParseResult | ParseError {
  try {
    const json = JSON.parse(jsonString);
    return parseDescriptor(json);
  } catch (err) {
    return {
      success: false,
      error: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
