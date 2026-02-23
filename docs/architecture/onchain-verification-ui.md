# On-Chain Verification UI Contract

This document defines the intended information hierarchy for the desktop
`On-chain Verification` panel.

## Design intent

The collapsed/default view prioritizes the two things users care about most:

1. `Safe Policy`
2. `Simulation effects`

These sections answer the operator's core question quickly:
"What policy am I signing under, and what does this transaction do?"

## Why this is intentional

- `Safe Policy` and `Simulation effects` are actionable signing context.
- The rest of the verification outputs are mostly technical provenance.
- When the status badge is `Fully Verified`, operators should not need to parse
  low-level verifier internals to make a decision.

## What stays in technical details

`Show details` is reserved for forensic/debug information, such as:

- Consensus verification detail rows
- Simulation verifier detail rows and reason codes
- Policy verifier detail rows and reason codes
- Core execution metadata and coverage summaries

## Product rule

Do not demote `Safe Policy` or `Simulation effects` behind the details toggle
in normal desktop verification flows.

Keep those two sections visible by default, and keep technical verification
internals in `Show details`.

## Trust wording rules

When the badge is `Fully Verified`:

- The subtitle must be anchored to consensus-verified context (for example
  consensus verified block number), not simulation freshness metadata.
- Badge popover copy must be consensus-mode aware:
  - `beacon`: Helios/finalized Beacon wording is valid.
  - `opstack` / `linea`: wording must explicitly keep the non-equivalence
    boundary versus Beacon finality.
