# Interpreter Precedence Contract

This document defines the stable precedence rules for transaction interpretation in SafeLens.

## Source of truth

- `packages/core/src/lib/interpret/index.ts`

The `INTERPRETERS` array is ordered and evaluated top-to-bottom. The first non-null interpretation wins.

Current order:

1. `interpretTokenTransfer`
2. `interpretCowSwapTwap`
3. `interpretCowSwapPreSign`
4. `interpretSafePolicy`
5. `erc7730Interpreter` (dynamic fallback)

## Contract

1. Hand-coded interpreters run before ERC-7730.
2. ERC-7730 is a fallback and should not override a matched hand-coded interpretation.
3. Interpreter resolution is deterministic: first match wins.
4. `disabledIds` filtering is applied after a match. If the matched ID is disabled, evaluation continues.

## Why this exists

Hand-coded interpreters capture protocol-specific logic and safety cues that are harder to express in generic descriptor formats. Keeping them first avoids regressions where generic descriptor matches hide stronger protocol-aware interpretations.

## Contribution guidance

When adding a new interpreter:

1. Decide whether it is protocol-specific enough for hand-coded logic.
2. If hand-coded, insert it before `erc7730Interpreter`.
3. Add tests that lock ordering behavior and fallback behavior.
4. Keep output shape aligned with `packages/core/src/lib/interpret/types.ts`.
