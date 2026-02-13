# SafeLens

SafeLens is a minimal, trustless toolkit for generating and verifying Gnosis Safe multisig evidence with as little trust as possible.

## What lives where

- `apps/generator` — Next.js app to generate `evidence.json` from Safe URLs
- `apps/desktop` — Tauri + Vite desktop app to verify evidence completely offline
- `packages/core` — shared logic (hashing, schema validation, warnings, parsing)
- `packages/cli` — CLI-first interface built on top of `@safelens/core`

## Quick start

```bash
bun install
```

### Generator (Next.js)

```bash
bun --cwd apps/generator dev
```

Open `http://localhost:3000` to generate evidence packages.

### Desktop verifier (Tauri)

```bash
bun --cwd apps/desktop dev
```

Then in another terminal:

```bash
bun --cwd apps/desktop tauri dev
```

### CLI

```bash
bun --cwd packages/cli dev --help
```

Examples:

```bash
bun --cwd packages/cli dev -- analyze "https://app.safe.global/transactions/tx?safe=eth:0x...&id=multisig_..." --out evidence.json
bun --cwd packages/cli dev -- verify --file evidence.json
bun --cwd packages/cli dev -- settings init
```

## Offline-first verification

- The desktop verifier never calls the network for verification.
- Settings are stored on disk as JSON and can be exported/imported.
- The CLI uses `~/.safelens/settings.json` by default.

## Security notes

- All critical data (Safe tx hashes) are recomputed locally.
- Evidence packages are validated with Zod.
- EIP-712 compliant hash computation.

## License

MIT
