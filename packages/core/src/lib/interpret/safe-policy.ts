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

function interpretChangeThreshold(
  params: DecodedParam[],
  txTo: string,
): Interpretation {
  const newThreshold = getParam(params, "_threshold") ?? "?";

  const details: SafePolicyChangeDetails = {
    changeType: "changeThreshold",
    safeAddress: txTo,
    newThreshold: Number(newThreshold),
  };

  return {
    protocol: "Safe",
    action: "Policy Change",
    summary: `Change signing threshold to ${newThreshold}`,
    details: details as unknown as Record<string, unknown>,
  };
}

function interpretAddOwner(
  params: DecodedParam[],
  txTo: string,
): Interpretation {
  const owner = getParam(params, "owner") ?? "?";
  const threshold = getParam(params, "_threshold") ?? "?";

  const details: SafePolicyChangeDetails = {
    changeType: "addOwnerWithThreshold",
    safeAddress: txTo,
    newOwner: owner,
    newThreshold: Number(threshold),
  };

  return {
    protocol: "Safe",
    action: "Policy Change",
    summary: `Add owner ${owner.slice(0, 10)}… and set threshold to ${threshold}`,
    details: details as unknown as Record<string, unknown>,
  };
}

function interpretRemoveOwner(
  params: DecodedParam[],
  txTo: string,
): Interpretation {
  const owner = getParam(params, "owner") ?? "?";
  const threshold = getParam(params, "_threshold") ?? "?";

  const details: SafePolicyChangeDetails = {
    changeType: "removeOwner",
    safeAddress: txTo,
    removedOwner: owner,
    newThreshold: Number(threshold),
  };

  return {
    protocol: "Safe",
    action: "Policy Change",
    summary: `Remove owner ${owner.slice(0, 10)}… and set threshold to ${threshold}`,
    details: details as unknown as Record<string, unknown>,
  };
}

function interpretSwapOwner(
  params: DecodedParam[],
  txTo: string,
): Interpretation {
  const oldOwner = getParam(params, "oldOwner") ?? "?";
  const newOwner = getParam(params, "newOwner") ?? "?";

  const details: SafePolicyChangeDetails = {
    changeType: "swapOwner",
    safeAddress: txTo,
    removedOwner: oldOwner,
    newOwner: newOwner,
  };

  return {
    protocol: "Safe",
    action: "Policy Change",
    summary: `Replace owner ${oldOwner.slice(0, 10)}… with ${newOwner.slice(0, 10)}…`,
    details: details as unknown as Record<string, unknown>,
  };
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
