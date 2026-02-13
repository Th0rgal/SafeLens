/**
 * Safe policy change interpreter.
 *
 * Detects transactions that modify the Safe's own configuration:
 * - changeThreshold: change the signing threshold
 * - addOwnerWithThreshold: add a new owner and optionally change threshold
 * - removeOwner: remove an existing owner and set new threshold
 * - swapOwner: replace one owner with another
 */

import type { Interpretation, SafePolicyChangeDetails, Interpreter } from "./types";
import { analyzeTransaction } from "../safe/warnings";
import type { Hex } from "viem";

interface DecodedParam {
  name?: string;
  type?: string;
  value?: unknown;
}

interface DecodedData {
  method?: string;
  parameters?: DecodedParam[];
}

const POLICY_METHODS: Record<string, string> = {
  changeThreshold: "Change Threshold",
  addOwnerWithThreshold: "Add Owner",
  removeOwner: "Remove Owner",
  swapOwner: "Swap Owner",
};

function getParam(params: DecodedParam[], name: string): string | undefined {
  return params.find((p) => p.name === name)?.value as string | undefined;
}

/** Wrap a SafePolicyChangeDetails into a full Interpretation. */
function policyResult(
  summary: string,
  details: SafePolicyChangeDetails,
  txTo: string,
  txData: string = "0x",
  txValue: bigint = 0n,
  txOperation: number = 0,
  method?: string,
): Extract<Interpretation, { id: "safe-policy" }> {
  // Generate warnings for this transaction
  const warnings = analyzeTransaction({
    safeAddress: txTo as Hex,
    to: txTo as Hex,
    value: txValue,
    data: txData as Hex,
    operation: txOperation as 0 | 1,
    decodedMethod: method,
  });

  return {
    id: "safe-policy",
    protocol: "Safe",
    action: "Policy Change",
    severity: "critical",
    summary,
    details: {
      ...details,
      warnings,
    },
  };
}

function interpretChangeThreshold(
  params: DecodedParam[],
  txTo: string,
): Interpretation {
  const newThreshold = getParam(params, "_threshold") ?? "?";
  return policyResult(
    `Change signing threshold to ${newThreshold}`,
    {
      changeType: "changeThreshold",
      safeAddress: txTo,
      newThreshold: Number(newThreshold),
    },
    txTo,
    "0x",
    0n,
    0,
    "changeThreshold"
  );
}

function interpretAddOwner(
  params: DecodedParam[],
  txTo: string,
): Interpretation {
  const owner = getParam(params, "owner") ?? "?";
  const threshold = getParam(params, "_threshold") ?? "?";
  return policyResult(
    `Add owner ${owner.slice(0, 10)}… and set threshold to ${threshold}`,
    {
      changeType: "addOwnerWithThreshold",
      safeAddress: txTo,
      newOwner: owner,
      newThreshold: Number(threshold),
    },
    txTo,
    "0x",
    0n,
    0,
    "addOwnerWithThreshold"
  );
}

function interpretRemoveOwner(
  params: DecodedParam[],
  txTo: string,
): Interpretation {
  const owner = getParam(params, "owner") ?? "?";
  const threshold = getParam(params, "_threshold") ?? "?";
  return policyResult(
    `Remove owner ${owner.slice(0, 10)}… and set threshold to ${threshold}`,
    {
      changeType: "removeOwner",
      safeAddress: txTo,
      removedOwner: owner,
      newThreshold: Number(threshold),
    },
    txTo,
    "0x",
    0n,
    0,
    "removeOwner"
  );
}

function interpretSwapOwner(
  params: DecodedParam[],
  txTo: string,
): Interpretation {
  const oldOwner = getParam(params, "oldOwner") ?? "?";
  const newOwner = getParam(params, "newOwner") ?? "?";
  return policyResult(
    `Replace owner ${oldOwner.slice(0, 10)}… with ${newOwner.slice(0, 10)}…`,
    {
      changeType: "swapOwner",
      safeAddress: txTo,
      removedOwner: oldOwner,
      newOwner: newOwner,
    },
    txTo,
    "0x",
    0n,
    0,
    "swapOwner"
  );
}

/**
 * Try to interpret a Safe transaction as a policy change.
 *
 * Detection heuristic:
 *   1. Transaction is a regular call (operation 0)
 *   2. The `to` address is the Safe itself (self-call)
 *   3. The method is one of the known Safe policy methods
 */
export const interpretSafePolicy: Interpreter = (
  dataDecoded,
  txTo,
  txOperation,
) => {
  if (txOperation !== 0) return null;

  const decoded = dataDecoded as DecodedData | null | undefined;
  if (!decoded?.method || !decoded.parameters) return null;

  if (!(decoded.method in POLICY_METHODS)) return null;

  const params = decoded.parameters;

  switch (decoded.method) {
    case "changeThreshold":
      return interpretChangeThreshold(params, txTo);
    case "addOwnerWithThreshold":
      return interpretAddOwner(params, txTo);
    case "removeOwner":
      return interpretRemoveOwner(params, txTo);
    case "swapOwner":
      return interpretSwapOwner(params, txTo);
    default:
      return null;
  }
};
