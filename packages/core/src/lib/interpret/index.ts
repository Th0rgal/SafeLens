/**
 * Transaction interpretation registry.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  SUPPORTED PROTOCOLS                                           │
 * │                                                                 │
 * │  id              │ protocol  │ action        │ severity         │
 * │  ────────────────┼───────────┼───────────────┼─────────────     │
 * │  erc20-transfer  │ ERC-20    │ Transfer/…    │ info/warning     │
 * │  cowswap-twap    │ CoW Swap  │ TWAP Order    │ info             │
 * │  safe-policy     │ Safe      │ Policy Change │ critical         │
 * │  erc7730         │ (dynamic) │ (dynamic)     │ info             │
 * │                                                                 │
 * │  To add a new protocol, follow the checklist in ./types.ts.    │
 * └─────────────────────────────────────────────────────────────────┘
 */

import type { Interpretation, Interpreter } from "./types";
import { interpretERC20Transfer } from "./erc20-transfer";
import { interpretCowSwapTwap } from "./cowswap-twap";
import { interpretSafePolicy } from "./safe-policy";
import { createERC7730Interpreter } from "../erc7730/interpreter";
import { getGlobalIndex } from "../erc7730/global-index";

// ── Interpreter registry ────────────────────────────────────────────
// Each interpreter is tried in order; the first non-null result wins.
// Hand-coded interpreters (CowSwap, Safe) run first, ERC-7730 as fallback.

// Lazy ERC-7730 interpreter — caches the inner interpreter and rebuilds
// only when the global index identity changes (after setGlobalDescriptors).
let cachedIndex: ReturnType<typeof getGlobalIndex> | null = null;
let cachedInterpreter: ReturnType<typeof createERC7730Interpreter> | null = null;

const erc7730Interpreter: Interpreter = (
  dataDecoded,
  txTo,
  txOperation,
  txData,
  chainId,
  txValue,
  txFrom,
  chains,
) => {
  const index = getGlobalIndex();
  if (index !== cachedIndex) {
    cachedIndex = index;
    cachedInterpreter = createERC7730Interpreter(index);
  }
  return cachedInterpreter!(
    dataDecoded,
    txTo,
    txOperation,
    txData,
    chainId,
    txValue,
    txFrom,
    chains,
  );
};

const INTERPRETERS: Interpreter[] = [
  interpretERC20Transfer,
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
  disabledIds?: string[],
  txData?: string | null,
  chainId?: number,
  txValue?: string,
  txFrom?: string,
  chains?: Record<string, { nativeTokenSymbol?: string }>,
): Interpretation | null {
  for (const interpret of INTERPRETERS) {
    const result = interpret(
      dataDecoded,
      txTo,
      txOperation,
      txData,
      chainId,
      txValue,
      txFrom,
      chains,
    );
    if (result) {
      if (disabledIds?.includes(result.id)) continue;
      return result;
    }
  }
  return null;
}

export type {
  Interpretation,
  Severity,
  CowSwapTwapDetails,
  SafePolicyChangeDetails,
  ERC20TransferDetails,
  ERC7730Details,
  TokenInfo,
} from "./types";
