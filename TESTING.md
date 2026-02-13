# SafeLens Testing Guide

This document describes how to test the SafeLens apps and CLI.

## Generator (Next.js)

1. Start the dev server:
```bash
bun --cwd apps/generator dev
```

2. Navigate to `http://localhost:3000`

3. Enter this test URL:
```
https://app.safe.global/transactions/tx?safe=eth:0x9fC3dc011b461664c835F2527fffb1169b3C213e&id=multisig_0x9fC3dc011b461664c835F2527fffb1169b3C213e_0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17
```

4. Click "Analyze"

5. Verify:
- Evidence package is generated
- Safe address, chain, and hashes display correctly
- Signatures count is shown

6. Click "Download JSON" and save the file

## Desktop verifier (Tauri)

1. Start the Vite dev server:
```bash
bun --cwd apps/desktop dev
```

2. Launch Tauri:
```bash
bun --cwd apps/desktop tauri dev
```

3. Upload the `evidence.json` from the generator

4. Click "Verify Evidence"

5. Verify:
- Success toast appears
- Safe TX hash is displayed
- Transaction details match
- Signatures list appears

### Offline check

Disconnect from the network and repeat step 3. Verification should still succeed.

## CLI

```bash
bun --cwd packages/cli dev -- analyze "https://app.safe.global/transactions/tx?safe=eth:0x9fC3dc011b461664c835F2527fffb1169b3C213e&id=multisig_0x9fC3dc011b461664c835F2527fffb1169b3C213e_0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17" --out evidence.json
bun --cwd packages/cli dev -- verify --file evidence.json
bun --cwd packages/cli dev -- settings init
```

Expected:
- Analyze writes a JSON file
- Verify returns "Evidence verified"
- Settings file created at `~/.safelens/settings.json`

## Automated tests

```bash
bun run test
```

This now runs:

- `packages/core` unit tests
- `packages/cli` command/output tests
- `apps/generator` utility tests
- `apps/desktop` airgap configuration tests

## Type checks

```bash
bun run type-check
```

This includes `packages/core`, `packages/cli`, `apps/generator`, and `apps/desktop`.

## URL parsing tests

### Valid URLs

```
https://app.safe.global/transactions/tx?safe=eth:0x9fC3dc011b461664c835F2527fffb1169b3C213e&id=multisig_0x9fC3dc011b461664c835F2527fffb1169b3C213e_0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17
```
Expected: parses successfully (chain: Ethereum Mainnet)

### Invalid URLs

```
https://app.safe.global/transactions/tx?id=multisig_0x123_0x456
```
Expected: error: "Missing 'safe' parameter"
