# SafeLens Roadmap: ERC-7730 Transaction Interpretation

## Goal

Replace hand-coded, per-protocol interpreters with a **generic ERC-7730 interpreter**
that reads standardized descriptor files to produce human-readable transaction overviews
for any supported protocol, without writing new code per protocol.

Hand-coded interpreters (CowSwap TWAP, Safe policy) remain for cases that require
deeper heuristics (multiSend unwrapping, struct decoding, severity). They run first;
the ERC-7730 interpreter acts as the fallback.

---

## Phase 1: Contract Registry (done)

Populate the default `contractRegistry` with verified contract names and addresses
extracted from ERC-7730 descriptors. Gives immediate value: known contract labels,
correct DelegateCall warnings, no new interpreter code.

**Protocols covered:** 1inch, Aave, Circle, Ethena, Kiln, Lido, LI.FI, Morpho,
OpenSea, Swell, Uniswap, Tether, WETH, ParaSwap, Permit2.

---

## Phase 2: Generic ERC-7730 Interpreter

### 2.1: ERC-7730 Descriptor Parser

Create a parser in `packages/core/src/lib/erc7730/` that loads and validates
ERC-7730 JSON descriptors.

**Must support:**
- `context.contract.deployments`: array of `{ chainId, address }` pairs
- `context.eip712.deployments`: same shape for EIP-712 message descriptors
- `metadata.owner`: protocol name (maps to `Interpretation.protocol`)
- `metadata.token`: optional `{ name, ticker, decimals }` for token contracts
- `metadata.constants`: reusable values referenced via `$.metadata.constants.X`
- `metadata.enums`: value-to-label mappings (e.g. Aave interest rate modes)
- `display.formats`: keyed by function signature or 4-byte selector
- `display.formats[sig].intent`: human-readable action (maps to `summary`)
- `display.formats[sig].fields`: array of field display specs
- `display.definitions`: reusable field formatters referenced via `$ref`
- `includes`: file inheritance (relative path to a base descriptor)

**Out of scope (for now):**
- `screens` (Ledger device-specific layout hints)
- `required` / `excluded` arrays (useful later for filtering)
- `eip712.schemas` (SafeLens doesn't verify EIP-712 messages yet)

**Deliverables:**
- `packages/core/src/lib/erc7730/types.ts`: TypeScript types for the descriptor schema
- `packages/core/src/lib/erc7730/parser.ts`: parse + validate a JSON descriptor
- `packages/core/src/lib/erc7730/resolve.ts`: resolve `$ref`, `includes`, `$.metadata.constants.X` references

### 2.2: ERC-7730 Descriptor Index

Build a lookup index from `(chainId, contractAddress, 4-byte selector)` to the
matching descriptor + format entry.

**Must support:**
- Case-insensitive address matching
- Multiple descriptors per contract (different files may cover different functions)
- Function signature keys (`"supply(address,uint256,address,uint16)"`): compute
  the 4-byte selector at index build time
- Direct 4-byte selector keys (Uniswap uses `"0xb858183f"` format)

**Deliverables:**
- `packages/core/src/lib/erc7730/index.ts`: builds and exposes the lookup index
- Bundled descriptors: ship a curated set of ERC-7730 JSON files in the package
  (the 17 protocols from Phase 1, approximately 30-40 descriptor files)

### 2.3: Generic Interpreter

Add a new interpreter that matches transactions against the ERC-7730 index and
returns a structured interpretation.

**Must support field formats:**
- `raw`: display value as-is
- `addressName`: resolve via SafeLens address book / contract registry
- `tokenAmount`: format with decimals from `metadata.token` or a dynamic `tokenPath`
- `amount`: format native currency (ETH value)
- `date`: format unix timestamp
- `unit`: numeric with unit string (e.g. "0.3%" for Uniswap fee tier)
- `enum`: map numeric value to human-readable label via `metadata.enums`

**Field path resolution:**
- `#.fieldName`: calldata parameter from `dataDecoded.parameters`
- `@.value`: transaction ETH value
- `@.from` / `@.to`: transaction sender/recipient
- `$.metadata.constants.X`: metadata constant
- `path.[0:20]`: byte slicing (Uniswap packed paths)
- `path.[-20:]`: last N bytes
- `path.[0]` / `path.[-1]`: array indexing

**Interpretation output:**
```typescript
// New variant in the Interpretation discriminated union
| {
    id: "erc7730";
    protocol: string;       // metadata.owner
    action: string;         // display.formats[sig].intent
    severity: "info";
    summary: string;        // intent (same as action for ERC-7730)
    details: ERC7730Details;
  }
```

Where `ERC7730Details` is:
```typescript
interface ERC7730Details {
  fields: Array<{
    label: string;
    value: string;          // already formatted
    format: string;         // original format hint for the UI
  }>;
}
```

**Deliverables:**
- `packages/core/src/lib/interpret/erc7730.ts`: the generic interpreter
- New union variant in `packages/core/src/lib/interpret/types.ts`
- Registered in `packages/core/src/lib/interpret/index.ts` (after hand-coded interpreters)

### 2.4: ERC-7730 Card Component

A single generic card component that renders any ERC-7730 interpretation by
iterating over the `fields` array. Each field is displayed as a label + formatted
value pair, with format-aware rendering:

- `addressName` fields render via `<AddressDisplay />`
- `tokenAmount` / `amount` fields render in monospace with token symbol
- `date` fields render as locale date string
- `enum` / `unit` / `raw` fields render as plain text

**Deliverables:**
- `apps/desktop/src/components/interpretations/erc7730-card.tsx`
- Registered in `apps/desktop/src/components/interpretations/registry.tsx`

### 2.5: Descriptor Management UI

Add a new tab in the desktop sidebar: **Protocols**.

This screen lets users:
- **View** all loaded ERC-7730 descriptors (protocol name, contract count, chain count)
- **Import** a new ERC-7730 JSON file (file upload or paste)
- **Remove** a user-imported descriptor
- **Reset** to built-in descriptors only

Imported descriptors are stored in the Tauri settings store alongside the existing
settings config. They are merged with the built-in descriptors at runtime.

**Deliverables:**
- `apps/desktop/src/screens/ProtocolsScreen.tsx`
- Sidebar nav entry (icon: `FileJson` or `Blocks` from lucide-react)
- Lazy-loaded in `App.tsx`
- Tauri store integration for persistence

### 2.6: Tests

**Unit tests (packages/core):**

- Parser tests: validate a well-formed descriptor, reject malformed ones
- Index tests: lookup by `(chainId, address, selector)` returns the correct format entry
- Interpreter tests against real ERC-7730 descriptors + real transaction fixtures:
  - Aave V3 `supply` (from `calldata-lpv3.json`)
  - Uniswap V3 `exactInputSingle` (from `calldata-UniswapV3Router02.json`)
  - Lido `submit` (from `calldata-stETH.json`)
  - 1inch `swap` (from `calldata-AggregationRouterV6.json`)
  - Ethena `cooldownShares` (from `calldata-ethena.json`)
  - ParaSwap swap (from `calldata-AugustusSwapper-v6.2.json`)
- Edge cases: unknown function selector, missing fields, null dataDecoded
- `$ref` resolution, `includes` inheritance, `$.metadata.constants` substitution
- Byte-slicing path resolution (`path.[0:20]`)

**Integration tests:**

- Round-trip: create evidence package with Aave `supply` tx → parse → interpret
  → verify the interpretation has correct protocol, action, and field values
- Verify hand-coded interpreters still take priority over ERC-7730 for CowSwap/Safe

---

## Protocol Coverage Matrix (Phase 2 target)

| Protocol | Source | Interpreter | Functions |
|---|---|---|---|
| CoW Swap | hand-coded | `cowswap-twap.ts` | TWAP Order (via multiSend) |
| Safe | hand-coded | `safe-policy.ts` | changeThreshold, addOwner, removeOwner, swapOwner |
| 1inch | ERC-7730 | generic | swap, unoswap, clipperSwap + variants |
| Aave V3 | ERC-7730 | generic | supply, borrow, repay, withdraw + 9 more |
| Circle (USDC) | ERC-7730 | generic | TransferWithAuthorization (EIP-712) |
| Ethena | ERC-7730 | generic | cooldownShares, cooldownAssets, unstake |
| Kiln | ERC-7730 | generic | ERC-4626 vault operations |
| Lido | ERC-7730 | generic | submit, wrap, unwrap, requestWithdrawals, claimWithdrawal |
| LI.FI | ERC-7730 | generic | 30+ bridge/swap functions |
| Morpho | ERC-7730 | generic | supply, borrow, repay, withdraw + collateral variants |
| MakerDAO | ERC-7730 | generic | Permit (EIP-712) |
| OpenSea | ERC-7730 | generic | Order (EIP-712) |
| Swell | ERC-7730 | generic | deposit, approve, transfer |
| Uniswap V3 | ERC-7730 | generic | exactInput, exactInputSingle, exactOutput, exactOutputSingle |
| Tether (USDT) | ERC-7730 | generic | transfer, approve |
| WETH | ERC-7730 | generic | deposit (wrap) |
| ParaSwap | ERC-7730 | generic | 13 swap functions |

---

## Non-Goals

- **UniversalRouter support**: Uniswap's UniversalRouter uses a command-pattern
  (`execute(bytes commands, bytes[] inputs)`) that ERC-7730 does not cover. This
  would require a hand-coded interpreter similar to CowSwap TWAP.
- **EIP-712 message verification**: SafeLens verifies transaction calldata, not
  signed messages. EIP-712 descriptors (Circle, Lens, OpenSea, MakerDAO) are
  parsed for address registry purposes but the display formatting is not used
  until SafeLens supports message verification.
- **Automatic registry updates**: Descriptors are bundled at build time or
  imported manually. No auto-fetch from GitHub.
