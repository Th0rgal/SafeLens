# Verification Source Contract

This document defines the shared trust/source contract used by core, CLI, and desktop output.

## Source of truth

- `packages/core/src/lib/trust/sources.ts`
- `packages/core/src/lib/trust/types.ts`
- `packages/core/src/lib/verify/index.ts`

## Stable IDs

Use constants from `VERIFICATION_SOURCE_IDS` and `GENERATION_SOURCE_IDS` instead of hardcoded strings.

Why:

1. Shared IDs keep CLI/UI/tests aligned.
2. Refactors remain compile-safe when IDs evolve.

## Context builder

Always construct context via `createVerificationSourceContext(...)`.

This enforces defaults from `DEFAULT_VERIFICATION_SOURCE_CONTEXT` and avoids field drift at call sites.

## Consensus trust matrix

Consensus trust for `consensus-proof` is derived from:

- `hasConsensusProof`
- `consensusVerified`
- `consensusMode` (`beacon`, `opstack`, `linea`)

Rules:

1. `hasConsensusProof=false`:
   - source status: `disabled`
   - trust: `rpc-sourced`
   - summary/detail explain proof omission and fallback trust
2. `hasConsensusProof=true`, `consensusVerified=false`:
   - source status: `enabled`
   - trust: `rpc-sourced`
   - summary/detail explain included-but-not-upgraded proof
3. `hasConsensusProof=true`, `consensusVerified=true`:
   - source status: `enabled`
   - trust:
     - beacon -> `consensus-verified-beacon`
     - opstack -> `consensus-verified-opstack`
     - linea -> `consensus-verified-linea`

For OP Stack and Linea, summary/detail must preserve the non-equivalence boundary to Beacon light-client finality.

## Decoded calldata trust matrix

`decoded-calldata` trust is derived from `decodedCalldataVerification`:

1. `self-verified` -> trust `self-verified`
2. `partial` -> trust `api-sourced` with partial-verification wording
3. `mismatch` -> trust `api-sourced` with explicit mismatch wording
4. `api-only` or omitted -> trust `api-sourced`

## Required tests

When changing this contract, update and run:

- `packages/core/src/lib/trust/__tests__/sources.test.ts`
- `packages/core/src/lib/verify/__tests__/report.test.ts`
- `packages/cli/src/cli.output.test.ts` (if output wording or IDs change)
