# Auditor Packet

Single entrypoint for reviewers who need fast, reproducible validation.

## Required docs

- `AUDIT.md`
- `TRUST_ASSUMPTIONS.md`
- `DEPENDENCIES.md`
- `VERIFY.md`
- `RELEASE_INTEGRITY.md`

## Quick verification commands

Run from repository root:

```bash
bun install --frozen-lockfile
bun run verify:ci
bun test --filter @safelens/core
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
bash scripts/audit/deps.sh
```

Expected result: all commands pass and `docs/audit/dependency-footprint.md` is generated.

## Trust-level interpretation

- `self-verified`: local deterministic checks passed.
- `proof-verified`: MPT proof checks passed.
- `consensus-verified-beacon`: beacon light-client checks passed.
- `consensus-verified-opstack` / `consensus-verified-linea`: deterministic envelope checks only, not beacon-equivalent.
- `rpc-sourced` / `api-sourced`: input accepted but not fully upgraded by independent proof checks.

## Review focus

- Verify trust upgrades only occur when all required proofs and root linkage checks pass.
- Verify any unsupported signature mode is clearly downgraded and surfaced as warning.
- Verify desktop verification remains airgapped (no external network calls).

## Dependency drift review

- Current snapshot: `docs/audit/dependency-footprint.md`
- Baseline snapshot: `docs/audit/dependency-footprint.baseline.md`
- Drift output: `docs/audit/dependency-footprint.diff`

If drift exists, require explicit rationale updates in `DEPENDENCIES.md`.
