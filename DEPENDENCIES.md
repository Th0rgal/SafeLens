# Dependency Audit

Why each dependency exists. Organized by package and split into verification-path (security-critical) vs UI/tooling (non-critical).

## Verification Path (security-critical)

These dependencies are in the trust boundary, they handle crypto, schema validation, or EVM execution.

### packages/core (TypeScript)

| Dependency | Version | Purpose |
|---|---|---|
| `viem` | ^2.21 | EIP-712 hashing, ABI decoding, RLP encoding, Merkle Patricia Trie proof verification. Standard Ethereum library with wide adoption and typed APIs. |
| `zod` | ^4.3 | Schema validation at the trust boundary between evidence packages and the verifier. All package fields are validated before any crypto runs. No network access. |

### apps/desktop/src-tauri (Rust)

| Dependency | Version | Purpose |
|---|---|---|
| `helios-consensus-core` | git rev `582fda3` | BLS12-381 sync committee verification for beacon consensus proofs. See [Helios pinning rationale](#helios-pinning-rationale). |
| `alloy` | 1.0.3 | Ethereum consensus types and SSZ deserialization. Used for parsing beacon block headers and execution payloads. Only `consensus` and `ssz` features enabled. |
| `revm` | 34 | Local EVM execution for simulation replay. Runs witness world-state through the EVM to verify packaged simulation effects. Only `std` feature enabled, default features disabled. |
| `tree_hash` | 0.12.1 | SSZ tree hashing for beacon block root computation. |
| `hex` | 0.4 | Hex encoding/decoding for Ethereum address and hash conversions. |
| `eyre` | 0.6.8 | Error handling in Rust verification path. |
| `typenum` | 1 | Compile-time numeric types required by SSZ fixed-length vectors. |
| `time` | 0.3 | Timestamp parsing for non-beacon envelope freshness checks. Only `parsing` feature enabled. |
| `serde` / `serde_json` | 1 | JSON serialization for Tauri IPC between the TypeScript frontend and Rust backend. |

### Patched dependencies

| Dependency | Source | Purpose |
|---|---|---|
| `ethereum_hashing` | ncitron fork, rev `7ee7094` | See [ethereum_hashing fork rationale](#ethereum_hashing-fork-rationale). |

## UI and Tooling (non-critical)

These dependencies are not in the verification trust boundary. They handle rendering, styling, and build tooling.

### apps/desktop (TypeScript frontend)

| Dependency | Version | Purpose |
|---|---|---|
| `react` / `react-dom` | ^18.3 | UI rendering for the desktop verifier frontend. |
| `@tauri-apps/api` | ^2.0 | Tauri framework frontend API (IPC, window management). |
| `@tauri-apps/plugin-fs` | ^2.0 | File system access for loading evidence packages. |
| `@tauri-apps/plugin-dialog` | ^2.0 | Native file picker dialogs. |
| `viem` | ^2.21 | Address formatting utilities in the UI layer. |
| `lucide-react` | ^0.454 | Icon library. |
| `class-variance-authority` | ^0.7 | CSS class composition for component variants. |
| `clsx` | ^2.1 | Conditional classname joining. |
| `tailwind-merge` | ^2.5 | Tailwind CSS class conflict resolution. |

### apps/desktop (dev)

| Dependency | Purpose |
|---|---|
| `@tauri-apps/cli` | Tauri build toolchain. |
| `vite` / `@vitejs/plugin-react` | Frontend bundler. |
| `tailwindcss` / `postcss` | CSS tooling. |
| `typescript` | Type checking. |

### apps/desktop (Rust, non-verification)

| Dependency | Version | Purpose |
|---|---|---|
| `tauri` | 2 | Desktop app framework. `macos-private-api` feature enables native sidebar vibrancy. |
| `tauri-plugin-fs` / `tauri-plugin-dialog` | 2 | Tauri plugins for file and dialog access. |
| `tauri-build` | 2 | Build-time code generation for Tauri. |
| `window-vibrancy` | 0.6 | macOS native vibrancy effect for the sidebar. |

### apps/generator

| Dependency | Version | Purpose |
|---|---|---|
| `next` | ^14.2 | React framework. Serves the generator web app. |
| `react` / `react-dom` | ^18.3 | UI rendering. |
| `lucide-react` | ^0.454 | Icons. |
| `class-variance-authority` / `clsx` / `tailwind-merge` | n/a | CSS utilities (same as desktop). |

### apps/generator (dev)

| Dependency | Purpose |
|---|---|
| `tailwindcss` / `postcss` / `autoprefixer` | CSS tooling. |
| `eslint` / `eslint-config-next` | Linting. |
| `typescript` | Type checking. |

### packages/core (dev)

| Dependency | Purpose |
|---|---|
| `vitest` | Unit test framework. |
| `typescript` | Type checking. |
| `@types/node` | Node.js type definitions. |

### packages/cli (dev)

| Dependency | Purpose |
|---|---|
| `typescript` | Type checking. |
| `@types/node` | Node.js type definitions. |

## Helios Pinning Rationale

```toml
helios-consensus-core = { git = "https://github.com/a16z/helios", rev = "582fda319ed1ecb5fb82c71f4fa755a32e01031a" }
```

**Why a git rev instead of a tagged release?**

The pinned commit (`582fda3`, 2026-02-18) includes a fix for hex-encoded `blockNumber` and `chainId` fields in beacon API responses ([helios#776](https://github.com/a16z/helios/pull/776)). The latest tagged Helios release is `0.11.0` (2025-12-16), which does not include this fix. SafeLens needs it because beacon finality update responses from some clients return numeric fields as hex strings.

**Commit provenance:** The commit is on the `main` branch of `a16z/helios`, 17 commits ahead of the `0.11.0` tag. It will be included in the next Helios release.

**Action item:** When Helios publishes a release that includes commit `582fda3`, migrate from `rev = "..."` to a version or tag pin.

## ethereum_hashing Fork Rationale

```toml
[patch.crates-io]
ethereum_hashing = { git = "https://github.com/ncitron/ethereum_hashing", rev = "7ee70944ed4fabe301551da8c447e4f4ae5e6c35" }
```

**What the fork changes:** The upstream `ethereum_hashing` crate (by `sigp`) uses the `ring` cryptography library for SHA-256 on x86_64 and falls back to the `sha2` crate on other architectures. The ncitron fork ([commit `7ee7094`](https://github.com/ncitron/ethereum_hashing/commit/7ee70944ed4fabe301551da8c447e4f4ae5e6c35)) removes the `ring` dependency entirely and uses `sha2` unconditionally on all platforms.

**Why this is needed:** `ring` causes cross-compilation issues for non-x86_64 targets (WASM, RISC-V) and adds a heavyweight C dependency. Helios's dependency tree pulls in `ethereum_hashing`, and without this patch, the build requires `ring`'s C compilation toolchain. The `sha2` crate is pure Rust and compiles everywhere.

**Fork author trust:** ncitron is the top contributor to `a16z/helios`. This fork is effectively maintained by the Helios team.

**Upstream status:** The upstream `sigp/ethereum_hashing` added a `sha2` feature flag (post-`v0.8.0`, unreleased) that allows opting into `sha2` without `ring`. However, this is not yet in a tagged release. Once upstream publishes a release with the `sha2` feature, this patch can be replaced with:

```toml
ethereum_hashing = { version = ">=0.9", default-features = false, features = ["sha2"] }
```

and the `[patch.crates-io]` section can be removed.
