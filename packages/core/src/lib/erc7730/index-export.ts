/**
 * ERC-7730 module exports.
 */

export { parseDescriptor, parseDescriptorFromString } from "./parser";
export type { ParseResult, ParseError } from "./parser";

export {
  resolveDescriptor,
  resolveFormatEntry,
  resolveFieldDefinition,
  resolveRef,
  resolveMetadataConstants,
} from "./resolve";

export {
  buildIndex,
  lookupFormat,
  lookupFormatBySignature,
  lookupFormatByMethodName,
  computeSelector,
  isSelector,
  normalizeFormatKey,
} from "./index";
export type { DescriptorIndex, IndexEntry } from "./index";

export { createERC7730Interpreter } from "./interpreter";
export { setGlobalDescriptors } from "./global-index";

export { bundledDescriptors } from "./descriptors/index";

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
} from "./types";
