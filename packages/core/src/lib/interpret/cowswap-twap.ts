/**
 * CowSwap TWAP order interpreter.
 *
 * Detects multiSend transactions originating from CowSwap that create
 * TWAP (Time-Weighted Average Price) orders via the Composable Order Framework.
 */

import type { CowSwapTwapDetails, Interpreter } from "./types";
import { resolveToken, formatTokenAmount } from "./token-utils";

// ── Well-known addresses (Ethereum Mainnet) ────────────────────────────

const COW_TWAP_HANDLER = "0x6cF1e9cA41f7611dEf408122793c358a3d11E5a5";
const COW_COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";

// ── Helpers ─────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── TWAP order data decoder ────────────────────────────────────────────

/**
 * Decode TWAP order parameters from the raw ABI-encoded bytes.
 *
 * The TWAP handler's `staticInput` is a tightly ABI-encoded struct:
 *   (address sellToken, address buyToken, address receiver,
 *    uint256 partSellAmount, uint256 minPartLimit,
 *    uint256 t0, uint256 n, uint256 t, uint256 span, bytes32 appData)
 */
export function decodeTwapOrderData(hexData: string): {
  sellToken: string;
  buyToken: string;
  receiver: string;
  partSellAmount: bigint;
  minPartLimit: bigint;
  t0: bigint;
  n: bigint;
  t: bigint;
  span: bigint;
  appData: string;
} {
  // Strip 0x prefix if present
  const data = hexData.startsWith("0x") ? hexData.slice(2) : hexData;

  const word = (index: number) => data.slice(index * 64, (index + 1) * 64);
  const toAddress = (w: string) => "0x" + w.slice(24);
  const toUint256 = (w: string) => BigInt("0x" + w);
  const toBytes32 = (w: string) => "0x" + w;

  return {
    sellToken: toAddress(word(0)),
    buyToken: toAddress(word(1)),
    receiver: toAddress(word(2)),
    partSellAmount: toUint256(word(3)),
    minPartLimit: toUint256(word(4)),
    t0: toUint256(word(5)),
    n: toUint256(word(6)),
    t: toUint256(word(7)),
    span: toUint256(word(8)),
    appData: toBytes32(word(9)),
  };
}

// ── Interpreter ─────────────────────────────────────────────────────────

/**
 * Try to interpret a Safe transaction as a CowSwap TWAP order.
 *
 * Detection heuristic:
 *   1. Transaction is a multiSend delegatecall
 *   2. One of the inner calls targets the Composable Order Framework
 *      with method `createWithContext`
 *   3. The handler parameter matches the known TWAP handler address
 */
export const interpretCowSwapTwap: Interpreter = (
  dataDecoded,
  _txTo,
  txOperation,
  _txData,
  chainId,
) => {
  if (txOperation !== 1) return null; // must be delegatecall (multiSend)

  const decoded = dataDecoded as {
    method?: string;
    parameters?: Array<{
      name?: string;
      valueDecoded?: Array<{
        operation?: number;
        to?: string;
        value?: string;
        data?: string;
        dataDecoded?: {
          method?: string;
          parameters?: Array<{
            name?: string;
            type?: string;
            value?: unknown;
          }>;
        };
      }>;
    }>;
  };

  if (decoded?.method !== "multiSend") return null;

  const txsParam = decoded.parameters?.find(
    (p) => p.name === "transactions"
  );
  const innerTxs = txsParam?.valueDecoded;
  if (!innerTxs) return null;

  // Find the createWithContext call targeting Composable CoW
  const createTx = innerTxs.find(
    (tx) =>
      tx.to?.toLowerCase() === COW_COMPOSABLE_COW.toLowerCase() &&
      tx.dataDecoded?.method === "createWithContext"
  );
  if (!createTx) return null;

  const params = createTx.dataDecoded!.parameters;
  if (!params) return null;

  // Extract the (handler, salt, orderData) tuple
  const paramsValue = params.find((p) => p.name === "params")
    ?.value as string[] | undefined;
  if (!paramsValue || paramsValue.length < 3) return null;

  const [handler, , orderDataHex] = paramsValue;

  // Verify this is the TWAP handler
  if (handler.toLowerCase() !== COW_TWAP_HANDLER.toLowerCase()) return null;

  // Decode the TWAP order data
  const order = decodeTwapOrderData(orderDataHex);

  const sellToken = resolveToken(order.sellToken, chainId);
  const buyToken = resolveToken(order.buyToken, chainId);
  const sellDecimals = sellToken.decimals ?? 18;
  const buyDecimals = buyToken.decimals ?? 18;

  const totalSellAmount = order.partSellAmount * order.n;

  const partSellFormatted = formatTokenAmount(
    order.partSellAmount.toString(),
    sellDecimals
  );
  const minPartFormatted = formatTokenAmount(
    order.minPartLimit.toString(),
    buyDecimals
  );
  const totalSellFormatted = formatTokenAmount(
    totalSellAmount.toString(),
    sellDecimals
  );

  const timeBetween = Number(order.t);
  const totalDuration = timeBetween * Number(order.n);

  // Look for a bundled token approval (common pattern: approve before TWAP)
  let approval: CowSwapTwapDetails["approval"];
  const approveTx = innerTxs.find(
    (tx) => tx.dataDecoded?.method === "approve"
  );
  if (approveTx?.dataDecoded?.parameters) {
    const spender = approveTx.dataDecoded.parameters.find(
      (p) => p.name === "guy" || p.name === "spender"
    )?.value as string | undefined;
    const amount = approveTx.dataDecoded.parameters.find(
      (p) => p.name === "wad" || p.name === "amount" || p.name === "value"
    )?.value as string | undefined;
    if (spender && amount && approveTx.to) {
      const approveToken = resolveToken(approveTx.to, chainId);
      approval = {
        token: approveToken,
        spender,
        amount,
        amountFormatted: formatTokenAmount(
          amount,
          approveToken.decimals ?? 18
        ),
      };
    }
  }

  const sellSymbol = sellToken.symbol ?? sellToken.address.slice(0, 10);
  const buySymbol = buyToken.symbol ?? buyToken.address.slice(0, 10);

  const details: CowSwapTwapDetails = {
    sellToken,
    buyToken,
    receiver: order.receiver,
    partSellAmount: order.partSellAmount.toString(),
    partSellAmountFormatted: `${partSellFormatted} ${sellSymbol}`,
    minPartLimit: order.minPartLimit.toString(),
    minPartLimitFormatted: `${minPartFormatted} ${buySymbol}`,
    totalSellAmount: totalSellAmount.toString(),
    totalSellAmountFormatted: `${totalSellFormatted} ${sellSymbol}`,
    startTime: Number(order.t0),
    numberOfParts: Number(order.n),
    timeBetweenParts: timeBetween,
    timeBetweenPartsFormatted: formatDuration(timeBetween),
    totalDuration,
    totalDurationFormatted: formatDuration(totalDuration),
    span: Number(order.span),
    appData: order.appData,
    approval,
  };

  return {
    id: "cowswap-twap",
    protocol: "CoW Swap",
    action: "TWAP Order",
    severity: "info",
    summary: `TWAP Sell ${totalSellFormatted} ${sellSymbol} → ${buySymbol} (${Number(order.n)} parts over ${formatDuration(totalDuration)})`,
    details,
  };
};
