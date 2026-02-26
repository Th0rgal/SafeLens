<p align="center">
  <img src="apps/desktop/src-tauri/icons/icon.png" width="128" alt="SafeLens" />
</p>

<h1 align="center">SafeLens</h1>

<p align="center">
  Offline transaction verifier for Safe multisig wallets with ERC-7730 clear signing.
</p>

<p align="center">
  <a href="https://safelens.lfg.rs/">Generator</a> · Desktop App · CLI
</p>

<p align="center">
  <img src="docs/screenshots/desktop-clear-signing-twap.webp" width="720" alt="SafeLens verifying a CoW TWAP order with clear signing" />
</p>

## What it does

SafeLens generates and verifies evidence packages for Gnosis Safe multisig transactions. Paste a Safe transaction URL into the [generator](https://safelens.lfg.rs/), download the `evidence.json`, then verify signatures and hashes offline using the desktop app or CLI.

- **Generate** an `evidence.json` package from any Safe transaction URL
- **Verify** signatures, hashes, and enriched proofs locally with zero network access
- **Clear signing** via built-in and ERC-7730 interpreters for human-readable transaction details
- **Consensus checks** via embedded Helios verifier for beacon-mode consensus proofs

## Trust model

The desktop verifier ships with a CSP that restricts `connect-src` to Tauri IPC only (`ipc: http://ipc.localhost`), with no external network origins and no shell-open capability. It cannot make network requests during verification. All crypto runs locally using bundled libraries. See [`TRUST_ASSUMPTIONS.md`](TRUST_ASSUMPTIONS.md) for the full model.

## Project docs

- Security policy: [`SECURITY.md`](SECURITY.md)
- Contributing guidelines: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Build verification: [`VERIFY.md`](VERIFY.md)

## Architecture and runbooks

- Dependency audit: [`DEPENDENCIES.md`](DEPENDENCIES.md)
- Docs index: [`docs/README.md`](docs/README.md)
- Interpreter precedence contract: [`docs/architecture/interpretation-precedence.md`](docs/architecture/interpretation-precedence.md)
- Verification source contract: [`docs/architecture/verification-source-contract.md`](docs/architecture/verification-source-contract.md)
- On-chain verification UI contract: [`docs/architecture/onchain-verification-ui.md`](docs/architecture/onchain-verification-ui.md)
- ERC-7730 bundle update runbook: [`docs/runbooks/erc7730-bundle-update.md`](docs/runbooks/erc7730-bundle-update.md)
- Simulation replay benchmark runbook: [`docs/runbooks/simulation-replay-benchmark.md`](docs/runbooks/simulation-replay-benchmark.md)

## Verification coverage

- `self-verified`: Safe tx hash recomputation and supported signature recovery.
- `proof-verified`: on-chain Safe policy proof verification (`eth_getProof` artifacts).
- `rpc-sourced` (simulation): local replay can validate consistency against witness inputs, but replay world-state accounts are not yet fully state-root proven.
- `consensus-verified-beacon`: beacon consensus proofs verified by desktop via Helios.
- `consensus-verified-opstack` / `consensus-verified-linea`: deterministic envelope checks with explicit non-equivalence to beacon light-client finality.

The generator/CLI can attach optional `onchainPolicyProof`, `simulation`, and `consensusProof` sections. Desktop/CLI verify consume these sections when present.

Simulation replay note: witness-only replay currently supports `CALL` (`operation=0`) paths. `DELEGATECALL` (`operation=1`) packages remain partial and keep packaged simulation effects.

### Desktop vs CLI

- **Desktop**: full verification path, including local simulation replay (`revm`) and consensus-proof verification.
- **CLI**: verifies hashes/signatures/proofs from the package, but does not run the desktop replay/consensus verifier path.

### Replay benchmark

Run the desktop replay benchmark harness (manual/ignored test) to capture p50/p95 latency:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml benchmark_replay_latency_profiles -- --ignored --nocapture
```

See [`docs/runbooks/simulation-replay-benchmark.md`](docs/runbooks/simulation-replay-benchmark.md) for interpretation guidance.

## Quick start

Generate an evidence package at [safelens.lfg.rs](https://safelens.lfg.rs/), or via CLI:

```bash
bun --cwd packages/cli dev analyze "https://app.safe.global/transactions/tx?..." --out evidence.json
```

Verify offline:

```bash
bun --cwd packages/cli dev verify --file evidence.json
```

## Screenshots

<details>
<summary>Desktop App</summary>

#### Transaction Details
<img src="docs/screenshots/desktop-transaction-details.webp" width="720" alt="Transaction details with decoded calls" />

#### ERC-7730 Clear Signing Interpreters
<img src="docs/screenshots/desktop-erc7730-interpreters.webp" width="720" alt="ERC-7730 clear signing interpreter management" />

</details>

<details>
<summary>CLI</summary>

#### Transaction Interpretation
<img src="docs/screenshots/cli-transaction-interpretation.webp" width="720" alt="CLI transaction interpretation with clear signing" />

#### Verification
<img src="docs/screenshots/cli-verification.webp" width="720" alt="CLI verification output with signatures and warnings" />

</details>

<details>
<summary>Generator</summary>

#### Evidence Package
<img src="docs/screenshots/generator-evidence-package.webp" width="720" alt="Generator web app with evidence package ready to download" />

</details>

## Development

<details>
<summary>Project structure, setup, and build instructions</summary>

### Structure

| Path | Description |
|------|-------------|
| `apps/generator` | Next.js webapp, creates and exports `evidence.json` |
| `apps/desktop` | Tauri + Vite desktop app, verifies evidence offline |
| `packages/core` | Shared validation, hashing, signature verification, warnings |
| `packages/cli` | CLI wrapper over core logic |

### Setup

Requires [Bun](https://bun.sh).

```bash
bun install
```

### Run

```bash
bun run dev          # generator at localhost:3000
bun run dev:tauri    # desktop app (full Tauri shell)
bun run dev:desktop  # desktop frontend only (no Tauri)
```

### Build

```bash
bun run build        # generator + desktop frontend assets
bun run build:tauri  # full desktop distributable
```

### CI Parity Check

```bash
bun run verify:ci    # lint + type-check + JS tests + Rust fmt/clippy/tests + build
```

### Settings

Settings are JSON (address book and contract registry).

- CLI: `~/.safelens/settings.json`
- Desktop: app data folder

```bash
bun --cwd packages/cli dev settings init   # initialize settings
bun --cwd packages/cli dev sources         # show verification sources
```

Generator environment flags:

- `NEXT_PUBLIC_ENABLE_LINEA_CONSENSUS=1` enables experimental Linea consensus envelope generation in `apps/generator`.
- Default behavior leaves this disabled, emitting explicit partial-support reasons in package export metadata.

### Cleanup

```bash
rm -rf apps/generator/.next apps/desktop/src-tauri/target apps/desktop/src-tauri/.tauri apps/desktop/src-tauri/Cargo.lock .opencode
```

</details>
