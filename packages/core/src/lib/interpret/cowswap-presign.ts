/**
 * CoW Protocol setPreSignature interpreter.
 *
 * Detects calls to the CoW Protocol Settlement contract's `setPreSignature`
 * method, which is used to pre-sign (or cancel) swap orders on-chain.
 *
 * The orderUid is a packed encoding: 32 bytes order digest + 20 bytes owner
 * address + 4 bytes validTo timestamp = 56 bytes total.
 */

import type { CowSwapPreSignDetails, Interpreter } from "./types";

// CoW Protocol Settlement contract (same address on Ethereum, Gnosis, etc.)
const COW_SETTLEMENT = "0x9008d19f58aabd9ed0d60971565aa8510560ab41";

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Decode an orderUid into its components.
 * Format: 32 bytes orderDigest + 20 bytes owner + 4 bytes validTo = 56 bytes.
 */
export function decodeOrderUid(orderUid: string): {
  orderDigest: string;
  owner: string;
  validTo: number;
} | null {
  const hex = orderUid.startsWith("0x") ? orderUid.slice(2) : orderUid;

  // 56 bytes = 112 hex chars
  if (hex.length !== 112) return null;

  const orderDigest = "0x" + hex.slice(0, 64);
  const owner = "0x" + hex.slice(64, 104);
  const validTo = parseInt(hex.slice(104, 112), 16);

  return { orderDigest, owner, validTo };
}

function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

// ── Interpreter ─────────────────────────────────────────────────────────

export const interpretCowSwapPreSign: Interpreter = (
  dataDecoded,
  txTo,
  txOperation,
) => {
  // Must be a regular call (not delegatecall)
  if (txOperation !== 0) return null;

  // Must target the CoW Settlement contract
  if (txTo.toLowerCase() !== COW_SETTLEMENT) return null;

  const decoded = dataDecoded as {
    method?: string;
    parameters?: Array<{
      name?: string;
      type?: string;
      value?: unknown;
    }>;
  } | null;

  if (decoded?.method !== "setPreSignature") return null;

  const params = decoded.parameters;
  if (!params) return null;

  // Extract orderUid
  const orderUidParam = params.find((p) => p.name === "orderUid");
  const signedParam = params.find((p) => p.name === "signed");

  if (!orderUidParam?.value || signedParam?.value === undefined) return null;

  const orderUid = String(orderUidParam.value);
  const signed = signedParam.value === true || signedParam.value === "true";

  const decoded_uid = decodeOrderUid(orderUid);
  if (!decoded_uid) return null;

  const validToFormatted = formatTimestamp(decoded_uid.validTo);

  const action = signed ? "Pre-Sign Order" : "Cancel Pre-Sign";
  const ownerShort = decoded_uid.owner.slice(0, 10) + "...";
  const digestShort = decoded_uid.orderDigest.slice(0, 14) + "...";

  const summary = signed
    ? `Pre-sign CoW order ${digestShort} for ${ownerShort} (expires ${validToFormatted})`
    : `Cancel pre-signed CoW order ${digestShort} for ${ownerShort}`;

  const details: CowSwapPreSignDetails = {
    orderUid,
    orderDigest: decoded_uid.orderDigest,
    owner: decoded_uid.owner,
    validTo: decoded_uid.validTo,
    validToFormatted,
    signed,
    settlementContract: txTo,
  };

  return {
    id: "cowswap-presign",
    protocol: "CoW Protocol",
    action,
    severity: "info",
    summary,
    details,
  };
};
