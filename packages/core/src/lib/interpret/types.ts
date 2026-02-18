/**
 * Transaction interpretation types.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  HOW TO ADD A NEW PROTOCOL                                     │
 * │                                                                 │
 * │  1. Define a detail interface below (e.g. MyProtocolDetails)    │
 * │  2. Add a variant to the Interpretation union at the bottom     │
 * │  3. Create an interpreter file in this directory                │
 * │  4. Register it in ./index.ts (INTERPRETERS array)              │
 * │  5. Create a card component in                                  │
 * │     apps/desktop/src/components/interpretations/                │
 * │  6. Register the component in                                   │
 * │     apps/desktop/src/components/interpretations/registry.tsx    │
 * │                                                                 │
 * │  TypeScript will error at steps 4 and 6 if you forget them.    │
 * └─────────────────────────────────────────────────────────────────┘
 */

// ── Shared types ────────────────────────────────────────────────────

/** A decoded token reference. */
export interface TokenInfo {
  address: string;
  symbol?: string;
  decimals?: number;
}

/**
 * Severity determines card styling. Set by the interpreter, never by the UI.
 *
 *  - info:     neutral (e.g. a DeFi order)
 *  - warning:  deserves attention (e.g. large approval)
 *  - critical: dangerous if misunderstood (e.g. Safe policy change)
 */
export type Severity = "info" | "warning" | "critical";

// ── Protocol detail types ───────────────────────────────────────────

/** CowSwap TWAP-specific details. */
export interface CowSwapTwapDetails {
  sellToken: TokenInfo;
  buyToken: TokenInfo;
  receiver: string;
  /** Per-part sell amount (raw wei string). */
  partSellAmount: string;
  /** Human-readable per-part sell amount. */
  partSellAmountFormatted: string;
  /** Minimum buy amount per part (raw wei string). */
  minPartLimit: string;
  /** Human-readable minimum buy amount per part. */
  minPartLimitFormatted: string;
  /** Total sell amount across all parts (raw wei string). */
  totalSellAmount: string;
  /** Human-readable total sell amount. */
  totalSellAmountFormatted: string;
  /** Start time (unix timestamp, 0 = immediate). */
  startTime: number;
  /** Number of TWAP parts. */
  numberOfParts: number;
  /** Seconds between each part. */
  timeBetweenParts: number;
  /** Human-readable duration per part. */
  timeBetweenPartsFormatted: string;
  /** Total duration in seconds. */
  totalDuration: number;
  /** Human-readable total duration. */
  totalDurationFormatted: string;
  /** Seconds each part order is valid (0 = entire interval). */
  span: number;
  /** App data hash (bytes32). */
  appData: string;
  /** Token approval details (if bundled in multiSend). */
  approval?: {
    token: TokenInfo;
    spender: string;
    amount: string;
    amountFormatted: string;
  };
}

/** Safe policy change details. */
export interface SafePolicyChangeDetails {
  /** Which Safe method was called. */
  changeType:
    | "changeThreshold"
    | "addOwnerWithThreshold"
    | "removeOwner"
    | "swapOwner";
  /** The Safe address being modified. */
  safeAddress: string;
  /** New threshold (for changeThreshold, addOwnerWithThreshold, removeOwner). */
  newThreshold?: number;
  /** Owner being added (for addOwnerWithThreshold, swapOwner). */
  newOwner?: string;
  /** Owner being removed (for removeOwner, swapOwner). */
  removedOwner?: string;
  /** Security warnings for this transaction */
  warnings?: Array<{
    level: "info" | "warning" | "critical";
    title: string;
    description: string;
    context?: Record<string, string>;
  }>;
}

/** ERC-7730 generic interpretation details. */
export interface ERC7730Details {
  fields: Array<{
    label: string;
    value: string;
    format: string;
  }>;
}

// ── Interpretation (discriminated union) ────────────────────────────
//
// Each variant has a unique `id` string that TypeScript uses to narrow
// the `details` type automatically. The UI uses `id` to pick the right
// card component — no string-matching on protocol/action needed.
//
// To add a new protocol, add a new variant here. TypeScript will then
// error in every place that needs to handle it (interpreter registry,
// UI component registry).

export type Interpretation =
  | {
      id: "cowswap-twap";
      protocol: "CoW Swap";
      action: "TWAP Order";
      severity: "info";
      summary: string;
      details: CowSwapTwapDetails;
    }
  | {
      id: "safe-policy";
      protocol: "Safe";
      action: "Policy Change";
      severity: "critical";
      summary: string;
      details: SafePolicyChangeDetails;
    }
  | {
      id: "erc7730";
      protocol: string;
      action: string;
      severity: "info";
      summary: string;
      details: ERC7730Details;
    };

// ── Interpreter function signature ──────────────────────────────────

/** An interpreter: returns a typed Interpretation variant, or null. */
export type Interpreter = (
  dataDecoded: unknown,
  txTo: string,
  txOperation: number,
  txData?: string | null,
) => Interpretation | null;
