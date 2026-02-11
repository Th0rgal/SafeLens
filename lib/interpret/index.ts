/**
 * Transaction interpretation registry.
 *
 * Add new protocol interpreters here. Each interpreter is tried in order;
 * the first one that returns a non-null result wins.
 */

import type { Interpretation, Interpreter } from "./types";
import { interpretCowSwapTwap } from "./cowswap";

const interpreters: Interpreter[] = [
  interpretCowSwapTwap,
  // Add more interpreters here as needed:
  // interpretAaveV3,
  // interpretUniswapV3,
  // interpretENS,
];

/**
 * Attempt to interpret a Safe transaction's decoded data.
 *
 * @param dataDecoded  - The `dataDecoded` field from the Safe Transaction Service API
 * @param txTo         - The `to` address of the Safe transaction
 * @param txOperation  - 0 for Call, 1 for DelegateCall
 * @returns An interpretation if one matches, or null
 */
export function interpretTransaction(
  dataDecoded: unknown,
  txTo: string,
  txOperation: number
): Interpretation | null {
  for (const interpret of interpreters) {
    const result = interpret(dataDecoded, txTo, txOperation);
    if (result) return result;
  }
  return null;
}

export type { Interpretation, CowSwapTwapDetails } from "./types";
