# Contributing to SafeLens

## Development Setup

Requires [Bun](https://bun.sh) (v1.3.9+) and [Rust](https://rustup.rs/) (1.93.1+).

```bash
bun install
```

## Project Structure

| Path | Description |
|------|-------------|
| `packages/core` | Shared crypto verification library (TypeScript) |
| `packages/cli` | CLI wrapper over core logic |
| `apps/generator` | Next.js web app, creates evidence packages |
| `apps/desktop` | Tauri + Vite desktop app, airgapped verification |

## Running Locally

```bash
bun run dev          # generator at localhost:3000
bun run dev:tauri    # desktop app (full Tauri shell)
```

## Testing

```bash
bun run test         # all unit tests (vitest)
bun run type-check   # TypeScript type-check across all packages
bun run rust:test    # Rust tests (desktop verifier)
bun run rust:clippy  # Rust lints
bun run verify:ci    # full CI parity check (lint + type-check + test + build)
```

Always run `bun run verify:ci` before submitting a PR. CI runs the same command.

## Pull Request Expectations

1. **One concern per PR.** Keep changes focused. A bug fix and a refactor are two PRs.
2. **Tests required.** New logic needs tests. Bug fixes need a regression test.
3. **CI must pass.** The `verify-ci` job runs lint, type-check, JS tests, Rust fmt/clippy/tests, and a full build.
4. **Commit messages.** Use conventional commits: `fix(core):`, `feat(desktop):`, `refactor(core):`, `docs:`, `test:`.

## Security Considerations

SafeLens is a security tool. Changes to these areas require extra scrutiny:

- **Verification path** (`packages/core/src/lib/verify/`, `packages/core/src/lib/proof/`, `apps/desktop/src-tauri/src/consensus.rs`): Any change to trust decisions, hash recomputation, or signature recovery.
- **Zod schemas** (`packages/core/src/lib/types.ts`): Schema changes affect the trust boundary between evidence packages and the verifier.
- **CSP / Tauri config** (`apps/desktop/src-tauri/tauri.conf.json`): The desktop app's airgap is enforced here. Changes are validated by `tests/airgap-config.test.ts`.
- **Cryptographic dependencies** (`Cargo.toml`): Helios, alloy, revm. Pin updates need justification.

## Architecture

- [`TRUST_ASSUMPTIONS.md`](TRUST_ASSUMPTIONS.md), full trust model
- [`AUDIT.md`](AUDIT.md), security architecture and attack surface
- [`docs/`](docs/), architecture contracts and runbooks
