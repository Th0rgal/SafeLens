/**
 * Token transfer interpreter (ERC-20 & native).
 *
 * Detects standard ERC-20 token operations:
 * - transfer(address to, uint256 amount)
 * - approve(address spender, uint256 amount)
 * - transferFrom(address from, address to, uint256 amount)
 *
 * And native token transfers (ETH, xDAI, MATIC, etc.):
 * - Empty calldata with non-zero value
 */

import type { TokenTransferDetails, Interpreter } from "./types";
import { resolveToken, formatTokenAmount } from "./token-utils";

// Max uint256, signals an "unlimited" approval
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
 * Try to interpret a Safe transaction as a token transfer (ERC-20 or native).
 *
 * Detection heuristic:
 *   1. Transaction is a regular call (operation 0)
 *   2a. Empty calldata with non-zero value → native transfer
 *   2b. The method name is "transfer", "approve", or "transferFrom"
 *       with matching ERC-20 parameters
 */
export const interpretTokenTransfer: Interpreter = (
  dataDecoded,
  txTo,
  txOperation,
  txData,
  chainId,
  txValue,
  _txFrom,
  chains,
) => {
  if (txOperation !== 0) return null;

  // ── Native transfer (empty calldata + non-zero value) ──────────────
  const isEmptyCalldata = !txData || txData === "0x" || txData === "0X";
  if (isEmptyCalldata && txValue && txValue !== "0") {
    const nativeSymbol = chainId
      ? (chains?.[String(chainId)]?.nativeTokenSymbol ?? "ETH")
      : "ETH";
    const formatted = formatTokenAmount(txValue, 18);
    const details: TokenTransferDetails = {
      actionType: "nativeTransfer",
      token: {
        address: "0x0000000000000000000000000000000000000000",
        symbol: nativeSymbol,
        decimals: 18,
      },
      to: txTo,
      amount: txValue,
      amountFormatted: `${formatted} ${nativeSymbol}`,
      isNative: true,
    };

    return {
      id: "token-transfer",
      protocol: "Native",
      action: "Transfer",
      severity: "info",
      summary: `Transfer ${formatted} ${nativeSymbol} to ${txTo.slice(0, 10)}…`,
      details,
    };
  }

  // ── ERC-20 operations ──────────────────────────────────────────────
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
      const details: TokenTransferDetails = {
        actionType: "transfer",
        token,
        to,
        amount,
        amountFormatted: `${formatted} ${tokenLabel}`,
      };

      return {
        id: "token-transfer",
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
      const details: TokenTransferDetails = {
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
        id: "token-transfer",
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
      const details: TokenTransferDetails = {
        actionType: "transferFrom",
        token,
        from,
        to,
        amount,
        amountFormatted: `${formatted} ${tokenLabel}`,
      };

      return {
        id: "token-transfer",
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
