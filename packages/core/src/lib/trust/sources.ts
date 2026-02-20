import type { TrustLevel } from "./types";

export type VerificationSourceStatus = "enabled" | "disabled";

export interface VerificationSource {
  id: string;
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
}

/**
 * Build trust assumptions for evidence generation.
 */
export function buildGenerationSources(): VerificationSource[] {
  return [
    {
      id: "safe-url-input",
      title: "Safe URL input",
      trust: "user-provided",
      summary: "Transaction URL is provided by the operator.",
      detail:
        "Assumption: the pasted URL references the intended Safe and transaction hash.",
      status: "enabled",
    },
    {
      id: "safe-api-response",
      title: "Safe Transaction Service response",
      trust: "api-sourced",
      summary: "Transaction payload and confirmations come from Safe API.",
      detail:
        "Assumption: HTTPS/TLS and Safe API response are correct for the requested safeTxHash.",
      status: "enabled",
    },
    {
      id: "packaged-at-timestamp",
      title: "Package timestamp",
      trust: "user-provided",
      summary: "packagedAt is generated from local system time.",
      detail:
        "Assumption: the generator machine clock is accurate enough for your audit trail.",
      status: "enabled",
    },
    {
      id: "exported-json",
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
  return [
    {
      id: "evidence-package",
      title: "Evidence package integrity",
      trust: "self-verified",
      summary: "Parsed and schema-validated locally.",
      detail:
        "Assumption: none beyond local parser/runtime integrity. Invalid JSON or invalid schema data is rejected before verification.",
      status: "enabled",
    },
    {
      id: "hash-recompute",
      title: "Safe tx hash",
      trust: "self-verified",
      summary: "Recomputed in your session.",
      detail:
        "Assumption: none beyond local hashing implementation integrity. The hash is recomputed from tx fields and must match evidence.safeTxHash.",
      status: "enabled",
    },
    {
      id: "signatures",
      title: "Signature checks",
      trust: "self-verified",
      summary: "Each signature is verified offline.",
      detail:
        "Assumption: claimed owners in the package are honest labels. Verification proves each signature recovers the claimed owner for safeTxHash.",
      status: "enabled",
    },
    context.hasUnsupportedSignatures
      ? {
          id: "signature-scheme-coverage",
          title: "Signature scheme coverage",
          trust: "api-sourced",
          summary: "Unsupported signature scheme detected.",
          detail:
            "Assumption: at least one signature uses a scheme not verified here (for example contract signatures or pre-approved hashes).",
          status: "enabled",
        }
      : {
          id: "signature-scheme-coverage",
          title: "Signature scheme coverage",
          trust: "self-verified",
          summary: "All signatures are locally verifiable EOA schemes.",
          detail:
            "Assumption: none additional. No contract signature (v=0) or pre-approved hash (v=1) entries were detected.",
          status: "disabled",
        },
    {
      id: "safe-owners-threshold",
      title: "Safe owners and threshold",
      trust: "api-sourced",
      summary: "Owner set and threshold are accepted from evidence.",
      detail:
        "Assumption: confirmations and confirmationsRequired in the package reflect the Safe's real policy for this transaction.",
      status: "enabled",
    },
    context.hasDecodedData
      ? {
          id: "decoded-calldata",
          title: "Decoded calldata",
          trust: "api-sourced",
          summary: "Decoded calldata is API-provided metadata.",
          detail:
            "Assumption: decoded method names/arguments are informational and may be wrong. Raw calldata and hash checks remain authoritative.",
          status: "enabled",
        }
      : {
          id: "decoded-calldata",
          title: "Decoded calldata",
          trust: "api-sourced",
          summary: "No decoded calldata was included in evidence.",
          detail:
            "Assumption: none for decoded metadata because this package contains only raw calldata.",
          status: "disabled",
        },
    context.hasSettings
      ? {
          id: "settings",
          title: "Address and contract labels",
          trust: "user-provided",
          summary: "Resolved from your local settings file.",
          detail:
            "Assumption: your settings file is correct. Labels, chain names, and warning enrichment are user-controlled metadata.",
          status: "enabled",
        }
      : {
          id: "settings",
          title: "Address and contract labels",
          trust: "api-sourced",
          summary: "No local settings file was used.",
          detail:
            "Assumption: none for local labeling. Targets/signers remain unlabeled, while cryptographic checks still run locally.",
          status: "disabled",
        },
  ];
}
