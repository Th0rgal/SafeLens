/**
 * ERC-20 transfer interpreter.
 *
 * Detects standard ERC-20 token operations:
 * - transfer(address to, uint256 amount)
 * - approve(address spender, uint256 amount)
 * - transferFrom(address from, address to, uint256 amount)
 */

import type { ERC20TransferDetails, Interpreter } from "./types";
import { resolveToken, formatTokenAmount } from "./token-utils";

// Max uint256 — signals an "unlimited" approval
const MAX_UINT256 =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

// ── Interpreter ─────────────────────────────────────────────────────────

interface DecodedParam {
  name?: string;
  type?: string;
  value?: unknown;
}

interface DecodedData {
  method?: string;
  parameters?: DecodedParam[];
}

function getParam(params: DecodedParam[], ...names: string[]): string | undefined {
  return params.find((p) => names.includes(p.name ?? ""))?.value as
    | string
    | undefined;
}

/**
 * Try to interpret a Safe transaction as an ERC-20 transfer, approve, or transferFrom.
 *
 * Detection heuristic:
 *   1. Transaction is a regular call (operation 0)
 *   2. The method name is "transfer", "approve", or "transferFrom"
 *   3. The parameters match the standard ERC-20 ABI
 */
export const interpretERC20Transfer: Interpreter = (
  dataDecoded,
  txTo,
  txOperation,
) => {
  if (txOperation !== 0) return null;

  const decoded = dataDecoded as DecodedData | null | undefined;
  if (!decoded?.method || !decoded.parameters) return null;

  const params = decoded.parameters;
  const token = resolveToken(txTo);
  const decimals = token.decimals ?? 18;
  const tokenLabel = token.symbol ?? txTo.slice(0, 10) + "…";

  switch (decoded.method) {
    case "transfer": {
      const to = getParam(params, "to", "_to", "dst", "recipient");
      const amount = getParam(params, "value", "_value", "amount", "wad");
      if (!to || !amount) return null;

      const formatted = formatTokenAmount(amount, decimals);
      const details: ERC20TransferDetails = {
        actionType: "transfer",
        token,
        to,
        amount,
        amountFormatted: `${formatted} ${tokenLabel}`,
      };

      return {
        id: "erc20-transfer",
        protocol: "ERC-20",
        action: "Transfer",
        severity: "info",
        summary: `Transfer ${formatted} ${tokenLabel} to ${to.slice(0, 10)}…`,
        details,
      };
    }

    case "approve": {
      const spender = getParam(params, "spender", "_spender", "guy");
      const amount = getParam(params, "value", "_value", "amount", "wad");
      if (!spender || !amount) return null;

      const isUnlimited = amount === MAX_UINT256;
      const formatted = isUnlimited
        ? "unlimited"
        : formatTokenAmount(amount, decimals);
      const details: ERC20TransferDetails = {
        actionType: "approve",
        token,
        spender,
        amount,
        amountFormatted: isUnlimited
          ? `unlimited ${tokenLabel}`
          : `${formatted} ${tokenLabel}`,
        isUnlimitedApproval: isUnlimited,
      };

      return {
        id: "erc20-transfer",
        protocol: "ERC-20",
        action: "Approve",
        severity: isUnlimited ? "warning" : "info",
        summary: `Approve ${formatted} ${tokenLabel} for ${spender.slice(0, 10)}…`,
        details,
      };
    }

    case "transferFrom": {
      const from = getParam(params, "from", "_from", "src", "sender");
      const to = getParam(params, "to", "_to", "dst", "recipient");
      const amount = getParam(params, "value", "_value", "amount", "wad");
      if (!from || !to || !amount) return null;

      const formatted = formatTokenAmount(amount, decimals);
      const details: ERC20TransferDetails = {
        actionType: "transferFrom",
        token,
        from,
        to,
        amount,
        amountFormatted: `${formatted} ${tokenLabel}`,
      };

      return {
        id: "erc20-transfer",
        protocol: "ERC-20",
        action: "TransferFrom",
        severity: "info",
        summary: `TransferFrom ${from.slice(0, 10)}… → ${to.slice(0, 10)}… (${formatted} ${tokenLabel})`,
        details,
      };
    }

    default:
      return null;
  }
};
