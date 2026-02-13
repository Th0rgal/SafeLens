# SafeLens

SafeLens is a minimal toolkit for working with Gnosis Safe multisig evidence:

- Generate an `evidence.json` package from a Safe transaction URL.
- Verify signatures and hashes locally with minimal trust.
- Keep settings and checks reproducible across tools.

## Trust and Airgap

- Full trust model: `TRUST_ASSUMPTIONS.md`
- CLI assumptions view: `bun --cwd packages/cli dev sources`
- Desktop verifier ships with production CSP `connect-src 'none'` and no shell-open capability.

## Project structure

- `apps/generator`: Next.js webapp that creates and exports `evidence.json`.
- `apps/desktop`: Tauri + Vite desktop app that verifies evidence offline.
- `packages/core`: Shared validation, hashing, signature verification, and warning logic.
- `packages/cli`: CLI wrapper over the same core logic.

## Requirements

- [Bun](https://bun.sh)

Install deps:

```bash
bun install
```

## Run locally

From the repo root:

```bash
bun run dev
```

Starts the generator webapp at `http://localhost:3000`.

Run desktop verifier dev mode:

```bash
bun run dev:tauri
```

That command builds the desktop frontend bundle and starts the Tauri shell.

If you want just the desktop web frontend (without launching Tauri):

```bash
bun run dev:desktop
```

## Core flows

### 1) Generate evidence

#### Web app

- Open generator at `http://localhost:3000`.
- Paste/enter a Safe transaction URL and export `evidence.json`.

#### CLI

```bash
bun --cwd packages/cli dev analyze "https://app.safe.global/transactions/tx?..." --out evidence.json
```

### 2) Verify evidence

#### Desktop app

- Open the app.
- Load the generated JSON file.
- Verification runs locally using bundled crypto and local settings.

#### CLI

```bash
bun --cwd packages/cli dev verify --file evidence.json
bun --cwd packages/cli dev verify --file evidence.json --format json
```

### 3) Settings

- Shared settings file is JSON (address book and contract registry).
- CLI default: `~/.safelens/settings.json`.
- Desktop default: app data folder (`safelens-settings.json`).
- You can initialize a CLI settings file with:

```bash
bun --cwd packages/cli dev settings init
```

Show sources used in a verification:

```bash
bun --cwd packages/cli dev sources
```

## Build and release

```bash
bun run build
```

Builds generator and desktop frontend assets.

```bash
bun run build:tauri
```

Builds full desktop distributable.

## Notes

- Desktop verification is designed to stay offline during `verify` and is guarded by automated airgap tests.
- The CLI is the primary interface for scripting and reproducible checks.
- `evidence.json` is the main interoperability boundary between all components.

## Local cleanup

Useful for keeping a clean working tree:

```bash
rm -rf apps/generator/.next apps/desktop/src-tauri/target apps/desktop/src-tauri/.tauri apps/desktop/src-tauri/Cargo.lock .opencode
```
