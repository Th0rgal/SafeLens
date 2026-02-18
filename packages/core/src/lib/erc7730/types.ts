/**
 * ERC-7730 descriptor types.
 *
 * Based on https://github.com/LedgerHQ/clear-signing-erc7730-registry
 */

// ── Deployment types ────────────────────────────────────────────────

export interface Deployment {
  chainId: number;
  address: string;
}

// ── Metadata types ──────────────────────────────────────────────────

export interface TokenMetadata {
  name: string;
  ticker: string;
  decimals: number;
}

export interface ConstantsMap {
  [key: string]: string | number | boolean;
}

export interface EnumDefinition {
  [value: string]: string; // value -> human-readable label
}

export interface EnumsMap {
  [enumName: string]: EnumDefinition;
}

export interface Metadata {
  owner: string; // Protocol name
  info?: {
    legalName?: string;
    lastUpdate?: string;
    url?: string;
  };
  token?: TokenMetadata;
  constants?: ConstantsMap;
  enums?: EnumsMap;
}

// ── Display types ───────────────────────────────────────────────────

export type FieldFormat =
  | "raw"
  | "addressName"
  | "tokenAmount"
  | "amount"
  | "date"
  | "unit"
  | "enum"
  | "percentage"
  | "calldata";

export interface FieldDefinition {
  label?: string;
  path?: string; // JSONPath expression
  format?: FieldFormat;
  /** For tokenAmount: path to token address or decimals */
  tokenPath?: string;
  /** For unit/percentage: unit string to append */
  unit?: string;
  /** For enum: name of the enum in metadata.enums */
  enum?: string;
  /** Reference to a reusable definition */
  $ref?: string;
  /** Parameters for the field (used in nested structures) */
  params?: {
    [key: string]: unknown;
  } | null;
  /** Nested sub-fields for structured data (e.g. Morpho marketParams) */
  fields?: unknown[];
  /** Static value */
  value?: unknown;
}

export interface FormatEntry {
  intent?: string; // Human-readable action
  fields: FieldDefinition[];
}

export interface DisplayFormats {
  [signatureOrSelector: string]: FormatEntry;
}

export interface DisplayDefinitions {
  [key: string]: FieldDefinition;
}

export interface Display {
  formats: DisplayFormats;
  definitions?: DisplayDefinitions;
}

// ── Context types ───────────────────────────────────────────────────

export interface ContractContext {
  deployments: Deployment[];
}

export interface EIP712Context {
  deployments: Deployment[];
  schemas?: unknown[]; // Not used in Phase 2
}

export interface Context {
  contract?: ContractContext;
  eip712?: EIP712Context;
}

// ── Root descriptor type ────────────────────────────────────────────

export interface ERC7730Descriptor {
  $schema?: string;
  context: Context;
  metadata: Metadata;
  display: Display;
  /** Path to a parent descriptor to inherit from */
  includes?: string;
}
