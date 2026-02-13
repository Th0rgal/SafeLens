# SafeLens Deployment Guide

## Generator (Next.js)

### Vercel

1. Import the repo.
2. Set the project root to `apps/generator`.
3. Build Command: `bun run build`
4. Install Command: `bun install`
5. Output Directory: `.next` (default)

### Manual

```bash
bun run --cwd apps/generator build
bun run --cwd apps/generator start
```

## Desktop Verifier (Tauri)

```bash
bun run --cwd apps/desktop build
bun run --cwd apps/desktop tauri build
```

## Notes

- The desktop verifier works fully offline after install.
- The generator app depends on Safe Transaction Service APIs.
