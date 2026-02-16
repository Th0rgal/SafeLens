# SafeLens

Offline transaction verifier for Safe multisig wallets with ERC-7730 clear signing support.

## Package manager

Use `bun` — not npm, pnpm, or yarn.

## Monorepo structure

- `packages/core` — shared logic (decoding, ERC-7730, verification)
- `apps/desktop` — Tauri + React desktop app
- `apps/generator` — Next.js site for generating verification packages
- `apps/cli` — CLI tool

## Key conventions

### Sidebar blur
The sidebar uses **native macOS vibrancy** (`NSVisualEffectMaterial::Sidebar` in `main.rs`). Do NOT use CSS `backdrop-filter: blur()` — it causes compositor glitches in WebKit/Tauri on macOS.

### Window dragging
Do NOT use `data-tauri-drag-region`. SafeLens uses a programmatic approach: a global `mousedown` listener in `App.tsx` detects clicks inside `.drag-region` elements and calls `appWindow.startDragging()`.

## Development

```sh
cd apps/desktop && bun run dev
```
