/**
 * Transaction interpretation types.
 *
 * Each interpreter detects a specific protocol or pattern in Safe transaction
 * calldata and returns a structured, human-readable interpretation.
 */

/** A decoded token reference */
export interface TokenInfo {
  address: string;
  symbol?: string;
  decimals?: number;
}

/** Base interpretation result — every interpreter returns at least this */
export interface Interpretation {
  /** Which protocol / dApp produced this transaction */
  protocol: string;
  /** Short human-readable summary, e.g. "TWAP Sell 5000 WETH → DAI" */
  summary: string;
  /** The type of action within the protocol */
  action: string;
  /** Structured details specific to the action */
  details: Record<string, unknown>;
}

/** CowSwap TWAP-specific details */
export interface CowSwapTwapDetails {
  sellToken: TokenInfo;
  buyToken: TokenInfo;
  receiver: string;
  /** Per-part sell amount (raw wei string) */
  partSellAmount: string;
  /** Human-readable per-part sell amount */
  partSellAmountFormatted: string;
  /** Minimum buy amount per part (raw wei string) */
  minPartLimit: string;
  /** Human-readable minimum buy amount per part */
  minPartLimitFormatted: string;
  /** Total sell amount across all parts (raw wei string) */
  totalSellAmount: string;
  /** Human-readable total sell amount */
  totalSellAmountFormatted: string;
  /** Start time (unix timestamp, 0 = immediate) */
  startTime: number;
  /** Number of TWAP parts */
  numberOfParts: number;
  /** Seconds between each part */
  timeBetweenParts: number;
  /** Human-readable duration per part */
  timeBetweenPartsFormatted: string;
  /** Total duration in seconds */
  totalDuration: number;
  /** Human-readable total duration */
  totalDurationFormatted: string;
  /** Seconds each part order is valid (0 = entire interval) */
  span: number;
  /** App data hash (bytes32) */
  appData: string;
  /** Token approval details (if bundled in multiSend) */
  approval?: {
    token: TokenInfo;
    spender: string;
    amount: string;
    amountFormatted: string;
  };
}

/** Safe policy change details */
export interface SafePolicyChangeDetails {
  /** Which Safe method was called */
  changeType: "changeThreshold" | "addOwnerWithThreshold" | "removeOwner" | "swapOwner";
  /** The Safe address being modified */
  safeAddress: string;
  /** New threshold (for changeThreshold, addOwnerWithThreshold, removeOwner) */
  newThreshold?: number;
  /** Owner being added (for addOwnerWithThreshold, swapOwner) */
  newOwner?: string;
  /** Owner being removed (for removeOwner, swapOwner) */
  removedOwner?: string;
  /** Previous owner in linked list (for removeOwner, swapOwner — internal) */
  prevOwner?: string;
}

/** An interpreter function: returns null if it doesn't recognise the tx */
export type Interpreter = (
  dataDecoded: unknown,
  txTo: string,
  txOperation: number
) => Interpretation | null;
