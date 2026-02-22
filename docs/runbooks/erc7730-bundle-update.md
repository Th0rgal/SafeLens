# ERC-7730 Bundle Update Runbook

This runbook defines the minimum review and validation steps for updating bundled ERC-7730 descriptors.

## Scope

This applies to:

- `packages/core/src/lib/erc7730/descriptors/index.ts`
- `packages/core/src/lib/settings/defaults.ts`

## Pinned source contract

SafeLens pins descriptor provenance to a specific upstream commit:

- `CLEAR_SIGNING_REGISTRY_COMMIT` in `packages/core/src/lib/settings/defaults.ts`
- Header comments and source links in `packages/core/src/lib/erc7730/descriptors/index.ts`

When updating descriptors, keep these references in sync.

## Update procedure

1. Select target commit in `LedgerHQ/clear-signing-erc7730-registry`.
2. Regenerate or update `packages/core/src/lib/erc7730/descriptors/index.ts` imports/array from that commit.
3. Update `CLEAR_SIGNING_REGISTRY_COMMIT` in `packages/core/src/lib/settings/defaults.ts`.
4. Confirm descriptor source URLs and commit references point to the same commit in both files.
5. Review descriptor diff for removed/renamed protocols and deployment changes.

## Required validation

Run at minimum:

```bash
bun --cwd packages/core test src/lib/erc7730/__tests__/parser.test.ts
bun --cwd packages/core test src/lib/erc7730/__tests__/index.test.ts
bun --cwd packages/core test src/lib/erc7730/__tests__/integration.test.ts
bun --cwd packages/core test src/lib/settings/__tests__/defaults.test.ts
bun --cwd packages/core type-check
```

If interpretation output changes materially, also run:

```bash
bun --cwd packages/core test src/lib/interpret/__tests__/token-transfer.test.ts
bun --cwd packages/cli test
```

## Review checklist

1. Commit pin is updated exactly once and reused consistently.
2. No manual edits to generated descriptor content beyond provenance metadata updates.
3. Descriptor parsing/build tests pass.
4. Settings defaults still build deterministic chain/contract/token entries.
5. PR notes include upstream commit URL and a short summary of descriptor coverage changes.
