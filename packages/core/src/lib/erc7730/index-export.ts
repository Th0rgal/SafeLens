/**
 * ERC-7730 module exports.
 */

export { parseDescriptor, parseDescriptorFromString } from "./parser.js";
export type { ParseResult, ParseError } from "./parser.js";

export {
  resolveDescriptor,
  resolveFormatEntry,
  resolveFieldDefinition,
  resolveRef,
  resolveMetadataConstants,
} from "./resolve.js";

export {
  buildIndex,
  lookupFormat,
  lookupFormatBySignature,
  lookupFormatByMethodName,
  computeSelector,
  isSelector,
  normalizeFormatKey,
} from "./index.js";
export type { DescriptorIndex, IndexEntry } from "./index.js";

export { createERC7730Interpreter } from "./interpreter.js";
export type { ERC7730Details } from "./interpreter.js";

export { bundledDescriptors } from "./descriptors/index.js";

export type {
  ERC7730Descriptor,
  Deployment,
  TokenMetadata,
  ConstantsMap,
  EnumDefinition,
  EnumsMap,
  Metadata,
  FieldFormat,
  FieldDefinition,
  FormatEntry,
  DisplayFormats,
  DisplayDefinitions,
  Display,
  ContractContext,
  EIP712Context,
  Context,
} from "./types.js";
