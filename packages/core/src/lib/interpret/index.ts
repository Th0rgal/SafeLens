/**
 * Transaction interpretation registry.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  SUPPORTED PROTOCOLS                                           │
 * │                                                                 │
 * │  id              │ protocol  │ action        │ severity         │
 * │  ────────────────┼───────────┼───────────────┼─────────────     │
 * │  cowswap-twap    │ CoW Swap  │ TWAP Order    │ info             │
 * │  safe-policy     │ Safe      │ Policy Change │ critical         │
 * │  erc7730         │ (dynamic) │ (dynamic)     │ info             │
 * │                                                                 │
 * │  To add a new protocol, follow the checklist in ./types.ts.    │
 * └─────────────────────────────────────────────────────────────────┘
 */

import type { Interpretation, Interpreter } from "./types";
import { interpretCowSwapTwap } from "./cowswap-twap";
import { interpretSafePolicy } from "./safe-policy";
import { createERC7730Interpreter } from "../erc7730/interpreter";
import { getGlobalIndex } from "../erc7730/global-index";

// ── Interpreter registry ────────────────────────────────────────────
// Each interpreter is tried in order; the first non-null result wins.
// Hand-coded interpreters (CowSwap, Safe) run first, ERC-7730 as fallback.

const erc7730Interpreter = createERC7730Interpreter(getGlobalIndex(), 1);

const INTERPRETERS: Interpreter[] = [
  interpretCowSwapTwap,
  interpretSafePolicy,
  erc7730Interpreter,
];

/**
 * Attempt to interpret a Safe transaction's decoded data.
 *
 * @returns A typed Interpretation variant if a protocol is recognized, or null.
 */
export function interpretTransaction(
  dataDecoded: unknown,
  txTo: string,
  txOperation: number,
): Interpretation | null {
  for (const interpret of INTERPRETERS) {
    const result = interpret(dataDecoded, txTo, txOperation);
    if (result) return result;
  }
  return null;
}

export type {
  Interpretation,
  Severity,
  CowSwapTwapDetails,
  SafePolicyChangeDetails,
  ERC7730Details,
  TokenInfo,
} from "./types";
