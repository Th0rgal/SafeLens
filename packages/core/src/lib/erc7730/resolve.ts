/**
 * ERC-7730 reference resolution.
 *
 * Resolves:
 * - $ref pointers to display.definitions
 * - $.metadata.constants.X references
 * - includes inheritance (future enhancement)
 */

import type {
  ERC7730Descriptor,
  FieldDefinition,
  FormatEntry,
} from "./types";

/**
 * Resolve a $ref pointer in a field definition.
 */
export function resolveRef(
  field: FieldDefinition,
  descriptor: ERC7730Descriptor
): FieldDefinition {
  if (!field.$ref || !descriptor.display.definitions) {
    return field;
  }

  const refKey = field.$ref.replace(/^#\/display\/definitions\//, "");
  const definition = descriptor.display.definitions[refKey];

  if (!definition) {
    console.warn(`$ref "${field.$ref}" not found in definitions`);
    return field;
  }

  // Merge the referenced definition with the field (field takes precedence)
  return {
    ...definition,
    ...field,
    $ref: undefined, // Remove the $ref after resolution
  };
}

/**
 * Resolve metadata constant references ($.metadata.constants.X) in a string value.
 */
export function resolveMetadataConstants(
  value: string,
  descriptor: ERC7730Descriptor
): string {
  if (!descriptor.metadata.constants) {
    return value;
  }

  // Match $.metadata.constants.X pattern
  const constantPattern = /\$\.metadata\.constants\.(\w+)/g;

  return value.replace(constantPattern, (match, constantName) => {
    const constantValue = descriptor.metadata.constants?.[constantName];
    if (constantValue === undefined) {
      console.warn(`Constant "${constantName}" not found in metadata`);
      return match;
    }
    return String(constantValue);
  });
}

/**
 * Recursively resolve all references in a field definition.
 */
export function resolveFieldDefinition(
  field: FieldDefinition,
  descriptor: ERC7730Descriptor
): FieldDefinition {
  // First resolve $ref
  let resolved = resolveRef(field, descriptor);

  // Then resolve metadata constants in string fields
  if (resolved.path) {
    resolved.path = resolveMetadataConstants(resolved.path, descriptor);
  }
  if (resolved.label) {
    resolved.label = resolveMetadataConstants(resolved.label, descriptor);
  }
  if (resolved.unit) {
    resolved.unit = resolveMetadataConstants(resolved.unit, descriptor);
  }

  return resolved;
}

/**
 * Resolve all field definitions in a format entry.
 */
export function resolveFormatEntry(
  entry: FormatEntry,
  descriptor: ERC7730Descriptor
): FormatEntry {
  return {
    ...entry,
    fields: entry.fields.map((field) =>
      resolveFieldDefinition(field, descriptor)
    ),
  };
}

/**
 * Resolve all references in a descriptor.
 */
export function resolveDescriptor(
  descriptor: ERC7730Descriptor
): ERC7730Descriptor {
  const resolvedFormats: typeof descriptor.display.formats = {};

  for (const [key, entry] of Object.entries(descriptor.display.formats)) {
    resolvedFormats[key] = resolveFormatEntry(entry, descriptor);
  }

  return {
    ...descriptor,
    display: {
      ...descriptor.display,
      formats: resolvedFormats,
    },
  };
}
