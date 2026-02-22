# SafeLens Audit Guide

Auditor's entry point. Architecture, trust model, security boundaries, and known risks.

## Architecture

Four components in a monorepo:

| Component | Role | Network access |
|---|---|---|
| `packages/core` | Shared crypto verification library (TS) | None during verify |
| `apps/generator` | Next.js web app — creates evidence packages | Yes (Safe API, RPC, Beacon) |
| `apps/desktop` | Tauri app — airgapped verification | None (`connect-src 'none'` CSP) |
| `packages/cli` | CLI wrapper over core | Yes for creation, none for verify |

### Data Flow

```
User Input (Safe URL/address)
  → Parse URL → chainId, safeAddress, safeTxHash
  → Fetch from Safe Transaction Service API (api-sourced)
  → Create base evidence package
  → OPTIONAL: Enrich with on-chain policy proof via eth_getProof (rpc-sourced)
  → OPTIONAL: Enrich with simulation via eth_call + state overrides (rpc-sourced)
  → OPTIONAL: Enrich with consensus proof (beacon BLS data or execution envelope)
  → Finalize export contract (fully-verifiable | partial)
  → Export JSON

Verification (desktop/CLI, offline):
  → Zod schema validation
  → Recompute safeTxHash from tx fields (CRITICAL: never trust package's hash)
  → ECDSA signature recovery against recomputed hash
  → MPT verification of on-chain policy proof against state root
  → MPT verification of simulation witness anchoring + digest
  → Local `revm` replay of simulation witness world state (desktop path)
  → BLS sync committee verification of consensus proof (Rust/Helios)
  → Cross-validate: consensus state root == policy proof state root
  → Emit trust-classified verification report
```

## Trust Model

### Trust Levels (highest to lowest)

| Level | Meaning |
|---|---|
| `consensus-verified-beacon` | State root verified via BLS sync committee signatures |
| `consensus-verified-opstack` | OP Stack envelope integrity checks (not BLS-equivalent) |
| `consensus-verified-linea` | Linea envelope integrity checks (not BLS-equivalent) |
| `proof-verified` | Validated against Merkle Patricia Trie proofs |
| `self-verified` | Locally recomputed (hash, ECDSA) |
| `rpc-sourced` | From RPC endpoint, not independently verified |
| `api-sourced` | From Safe Transaction Service API |
| `user-provided` | Operator input |

### Critical Trust Upgrade

`rpc-sourced` → `consensus-verified-*` requires ALL of:
1. Consensus proof present and validated by desktop verifier
2. On-chain policy proof present
3. Verified state root matches policy proof's state root
4. Verified block number matches policy proof's block number

Any failure → stays `rpc-sourced`. See `evaluateConsensusTrustDecision()` in `verify/index.ts`.

### OP Stack / Linea Trust Boundary

OP Stack and Linea consensus proofs are RPC-sourced execution header reads — **not** independent consensus verification. A compromised RPC can forge both sides.

**Defense**: These modes cannot promote packages to `fully-verifiable`. The creator enforces `hasVerifierSupportedConsensusProof = hasConsensusProofArtifact && proofConsensusMode === "beacon"` (`creator.ts:228-229`).

## Cryptographic Methods

### BLS Sync Committee (Beacon Consensus)

- **Library**: Helios consensus-core (Rust, `consensus.rs`)
- **Algorithm**: BLS12-381 aggregate signatures over beacon block headers
- **Chain**: beacon block root → execution payload root → EVM state root
- **Threshold**: >2/3 of 512-member sync committee
- **Only finalized headers accepted**
- **Fork-aware**: Chain-specific genesis roots and fork schedules bundled

### Merkle Patricia Trie (Policy Proofs)

- **Library**: Custom viem-based verifier (`proof/mpt.ts`, `proof/verify-policy.ts`)
- **Verifies**: Account proof against state root, storage proofs against storage root
- **Safe slots verified**: singleton, owners (linked list), modules (linked list), threshold, nonce, guard, fallback handler
- **Completeness**: Linked list walks are validated (sentinel → items → sentinel)

### ECDSA Signatures

- **Schemes**: `v=27/28` (EIP-712), `v=31/32` (eth_sign wrapped), `v=0/1` (contract/pre-approved, unsupported → warning)
- **Defense**: Always verified against **recomputed** safeTxHash, not the package's claimed hash

### EIP-712 Hashing

- **Domain**: `EIP712Domain(uint256 chainId, address verifyingContract)`
- **SafeTx struct**: 10 fields. Replay protection via chainId + nonce
- **Hardware wallet support**: Returns domain separator and message hash separately

## Attack Surface

### Generation Phase (network-connected)

| Input | Validation | Risk |
|---|---|---|
| Safe URL (user) | Regex parse, Zod schema | Malformed URLs |
| Safe API response | Zod `safeTransactionSchema` | Malformed payloads |
| RPC `eth_getProof` | Zod `accountProofSchema` | Malformed proofs |
| RPC `eth_call` | ABI decoding (viem) | Invalid return data |
| Beacon API response | Rust SSZ deserialization | Malformed BLS data |
| Custom RPC URL | URL validation | SSRF (client-side only) |

### Verification Phase (airgapped)

| Input | Validation | Risk |
|---|---|---|
| Evidence package JSON | Zod schema | Type confusion, malformed data |
| safeTxHash (claimed) | Recomputed, never trusted | **Hash substitution attack** |
| Signatures | Length check + ECDSA recovery | Invalid/malleabile signatures |
| Consensus proof | BLS verification (Rust) | Forged committee signatures |
| Settings file | Zod schema | Malformed user config |

### Airgap Enforcement

- CSP: `connect-src 'none'` in production
- Tauri: No shell-open, no HTTP plugin
- Automated test: `tests/airgap-config.test.ts` validates both

## Design Decisions

### Why recompute safeTxHash instead of trusting the package field?

Defense against **hash substitution**: A malicious generator could provide valid signatures for transaction A but claim the package describes transaction B. Always recomputing from tx fields and verifying signatures against the recomputation prevents this.

### Why a known private key for simulation?

Simulation uses Hardhat account #0 (`0xac09...ff80`) — universally known and never controls real funds. Safe here because:
- Only used in `eth_call` (read-only RPC method)
- State overrides plant this as the sole 1-of-1 owner
- Never used with `eth_sendRawTransaction`

### Why separate beacon vs non-beacon trust paths?

Beacon light client provides independent cryptographic verification (BLS aggregate signatures from >2/3 of sync committee). OP Stack/Linea envelopes are just RPC header reads — a compromised RPC can forge them. Different trust levels reflect this.

### Why offline verification?

Evidence packages may contain sensitive pre-execution transaction details. Airgapped verification ensures no data leaks. The desktop app's CSP enforcement and Tauri allowlist prevent any network access during verification.

## Known Risks

### Accepted

| Risk | Why accepted |
|---|---|
| RPC trust during generation | Mitigated by offline consensus verification |
| Safe API trust during generation | Mitigated by offline hash recomputation + signature verification |
| System clock trust for `packagedAt` | Operator responsibility; no independent time source available |
| OP Stack/Linea envelope forgery by compromised RPC | Explicitly labeled as partial trust; cannot reach fully-verifiable |
| Contract signatures (v=0) not verified offline | Require on-chain call; flagged as warning in verification report |
| Beacon API responses not Zod-validated (generation only) | Malformed beacon data causes runtime errors during generation, not during verification. Verification uses the Rust Helios path which has its own SSZ validation. Fixing requires defining schemas for all beacon light-client API response shapes |

### Open Issues (this PR)

| Issue | Severity | Location |
|---|---|---|
| `fetchBeaconJson` returns `Promise<any>` — beacon API responses lack Zod validation | Medium | `beacon-api.ts:368` |
| No Rust toolchain in CI for desktop build verification | Process | CI config |

### Replay Status

| Capability | Status |
|---|---|
| Witness-complete local replay (`revm`) for simulation verification | Implemented |
| Deterministic mismatch reason codes for replay failures | Implemented |
| Replay latency benchmark harness (`p50`/`p95`) | Implemented (`benchmark_replay_latency_profiles`) |

### Resolved In Current Branch

| Issue | Resolution |
|---|---|
| `fail_result()` dropped accumulated checks in non-beacon envelope verifier | Fixed by returning `fail_result_with_context(...)` for post-envelope validation failures (invalid expected policy root, missing/invalid `packagePackagedAt`). Existing checks and verified envelope context are now preserved. |
| Future-dated envelope timestamp freshness ambiguity | Explicitly rejected when skew exceeds `NON_BEACON_MAX_FUTURE_SKEW_SECS`; covered by regression tests in `consensus.rs`. |
| State-root normalization mismatch risk in envelope verification | Roots are normalized through `parse_b256` + canonical hex formatting before comparison. |

## External Dependencies

| Dependency | Version | Why trusted | Risk |
|---|---|---|---|
| viem | ^2.x | Standard EVM library, wide adoption, typed | RLP/ABI decoding bugs |
| zod | ^3.x | Schema validation, no network access | Validation bypass |
| helios-consensus-core | (Rust) | a]16z-maintained Ethereum light client | BLS verification bugs |
| alloy-primitives | (Rust) | Standard Ethereum types | Type handling bugs |

All verification-path dependencies are local-only (no network access). Generation-path additionally uses viem's HTTP transport.

## File Map (Security-Critical)

```
packages/core/src/lib/
  types.ts              — Zod schemas (trust boundary definitions)
  safe/hash.ts          — EIP-712 safeTxHash computation
  safe/signatures.ts    — ECDSA signature recovery
  proof/verify-policy.ts — MPT proof verification
  proof/mpt.ts          — Merkle Patricia Trie verifier
  verify/index.ts       — Verification orchestration + trust decisions
  package/creator.ts    — Evidence package creation + export contract
  trust/sources.ts      — Trust classification logic
  consensus/index.ts    — Consensus proof fetching (beacon + execution)

apps/desktop/src-tauri/src/
  consensus.rs          — BLS verification + non-beacon envelope checks
```
