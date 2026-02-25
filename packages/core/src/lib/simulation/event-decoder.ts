/**
 * Simulation event log decoder.
 *
 * Decodes raw EVM event logs into human-readable token movements:
 * - ERC-20:   Transfer, Approval
 * - ERC-721:  Transfer (single NFT)
 * - ERC-1155: TransferSingle, TransferBatch
 * - WETH:     Deposit, Withdrawal
 *
 * Used by the desktop verifier to show a Rabby/Colibri-style summary
 * instead of raw hex checks.
 */

import type { SimulationLog, NativeTransfer } from "../types";
import { formatTokenAmount } from "./format";
import { resolveTokenMeta } from "../tokens/well-known";

// ── Event signatures (keccak256 hashes) ──────────────────────────────

/** Transfer(address indexed from, address indexed to, uint256 value): ERC-20 and ERC-721 */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Approval(address indexed owner, address indexed spender, uint256 value): ERC-20 */
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

/** TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value) */
const TRANSFER_SINGLE_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";

/** TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values) */
const TRANSFER_BATCH_TOPIC =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

/** Deposit(address indexed dst, uint256 wad): WETH wrap */
const DEPOSIT_TOPIC =
  "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";

/** Withdrawal(address indexed src, uint256 wad): WETH unwrap */
const WITHDRAWAL_TOPIC =
  "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";

// ── Decoded event types ───────────────────────────────────────────────

export type DecodedEventKind =
  | "transfer"
  | "approval"
  | "nft-transfer"
  | "erc1155-transfer"
  | "wrap"
  | "unwrap"
  | "native-transfer";

export interface DecodedEvent {
  /** What kind of token event this is. */
  kind: DecodedEventKind;
  /** The contract that emitted the event (token address). */
  token: string;
  /** Resolved token symbol (e.g. "WETH") or null if unknown. */
  tokenSymbol: string | null;
  /** Token decimals, null for NFTs or unknown tokens. */
  tokenDecimals: number | null;
  /** Human-readable formatted amount (e.g. "5,000.0000 WETH"). */
  amountFormatted: string;
  /** Raw amount as decimal string. */
  amountRaw: string;
  /** From address. */
  from: string;
  /** To address. */
  to: string;
  /** Direction relative to the Safe: "send", "receive", or "internal". */
  direction: "send" | "receive" | "internal";
  /** NFT token ID (for ERC-721 and ERC-1155). */
  tokenId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Extract a 20-byte address from a 32-byte log topic. */
function topicToAddress(topic: string): string {
  // A valid 32-byte topic is 66 chars: "0x" + 64 hex chars.
  // slice(26) needs 40 remaining chars to produce a full address.
  if (topic.length < 66) return "0x" + "0".repeat(40);
  return "0x" + topic.slice(26).toLowerCase();
}

/** Decode a uint256 from hex (32 bytes of data). */
function hexToDecimal(hex: string): string {
  // Remove 0x prefix if present
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length === 0) return "0";
  return BigInt("0x" + clean).toString();
}

/** Format a raw token amount with decimals (delegates to shared formatter). */
function formatAmount(raw: string, decimals: number, symbol: string | null): string {
  return formatTokenAmount(BigInt(raw), decimals, symbol);
}

/** Determine direction relative to the Safe address. */
function getDirection(from: string, to: string, safeAddress?: string): "send" | "receive" | "internal" {
  if (!safeAddress) return "internal";
  const safe = safeAddress.toLowerCase();
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();
  if (fromLower === safe && toLower === safe) return "internal";
  if (fromLower === safe) return "send";
  if (toLower === safe) return "receive";
  return "internal";
}

// ── Main decoder ──────────────────────────────────────────────────────

/**
 * Decode simulation event logs into human-readable token movements.
 *
 * @param logs       - Raw simulation logs from the evidence package.
 * @param safeAddress - The Safe wallet address (for determining send/receive direction).
 * @param chainId    - Chain ID for token metadata lookup.
 * @returns Array of decoded events. Unrecognized events are skipped.
 */
export function decodeSimulationEvents(
  logs: SimulationLog[],
  safeAddress?: string,
  chainId?: number,
): DecodedEvent[] {
  const events: DecodedEvent[] = [];

  for (const log of logs) {
    if (log.topics.length === 0) continue;

    const sig = log.topics[0].toLowerCase();
    const tokenAddr = log.address.toLowerCase();
    const meta = resolveTokenMeta(tokenAddr, chainId);

    switch (sig) {
      case TRANSFER_TOPIC: {
        if (log.topics.length === 3 && log.data.length >= 66) {
          // ERC-20 Transfer(from, to, value)
          const from = topicToAddress(log.topics[1]);
          const to = topicToAddress(log.topics[2]);
          const amountRaw = hexToDecimal(log.data.slice(0, 66));
          events.push({
            kind: "transfer",
            token: tokenAddr,
            tokenSymbol: meta?.symbol ?? null,
            tokenDecimals: meta?.decimals ?? null,
            amountFormatted: meta
              ? formatAmount(amountRaw, meta.decimals, meta.symbol)
              : amountRaw,
            amountRaw,
            from,
            to,
            direction: getDirection(from, to, safeAddress),
          });
        } else if (log.topics.length === 4) {
          // ERC-721 Transfer(from, to, tokenId)
          const from = topicToAddress(log.topics[1]);
          const to = topicToAddress(log.topics[2]);
          const tokenId = hexToDecimal(log.topics[3]);
          events.push({
            kind: "nft-transfer",
            token: tokenAddr,
            tokenSymbol: meta?.symbol ?? null,
            tokenDecimals: null,
            amountFormatted: meta
              ? `${meta.symbol} #${tokenId}`
              : `NFT #${tokenId}`,
            amountRaw: "1",
            from,
            to,
            direction: getDirection(from, to, safeAddress),
            tokenId,
          });
        }
        break;
      }

      case APPROVAL_TOPIC: {
        if (log.topics.length < 3) break;
        const owner = topicToAddress(log.topics[1]);
        const spender = topicToAddress(log.topics[2]);
        const amountRaw = log.data.length >= 66
          ? hexToDecimal(log.data.slice(0, 66))
          : "0";

        const MAX_UINT256 =
          "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        const isUnlimited = amountRaw === MAX_UINT256;

        events.push({
          kind: "approval",
          token: tokenAddr,
          tokenSymbol: meta?.symbol ?? null,
          tokenDecimals: meta?.decimals ?? null,
          amountFormatted: isUnlimited
            ? `Unlimited ${meta?.symbol ?? "tokens"}`
            : meta
              ? formatAmount(amountRaw, meta.decimals, meta.symbol)
              : amountRaw,
          amountRaw,
          from: owner,
          to: spender,
          direction: getDirection(owner, spender, safeAddress),
        });
        break;
      }

      case TRANSFER_SINGLE_TOPIC: {
        if (log.topics.length < 4 || log.data.length < 130) break;
        // operator in topics[1], from in topics[2], to in topics[3]
        const from = topicToAddress(log.topics[2]);
        const to = topicToAddress(log.topics[3]);
        const tokenId = hexToDecimal(log.data.slice(2, 66));
        const amountRaw = hexToDecimal("0x" + log.data.slice(66, 130));

        events.push({
          kind: "erc1155-transfer",
          token: tokenAddr,
          tokenSymbol: meta?.symbol ?? null,
          tokenDecimals: null,
          amountFormatted: meta
            ? `${amountRaw}x ${meta.symbol} #${tokenId}`
            : `${amountRaw}x #${tokenId}`,
          amountRaw,
          from,
          to,
          direction: getDirection(from, to, safeAddress),
          tokenId,
        });
        break;
      }

      case TRANSFER_BATCH_TOPIC: {
        if (log.topics.length < 4) break;
        const from = topicToAddress(log.topics[2]);
        const to = topicToAddress(log.topics[3]);
        // TransferBatch data: two ABI-encoded uint256[] arrays (ids and amounts)
        // Layout: offset_ids(32) | offset_vals(32) | len_ids(32) | ids... | len_vals(32) | vals...
        const data = log.data.slice(2); // strip 0x
        if (data.length < 320) break; // need at least 5 words (2 offsets + 2 lengths + 1 element)

        try {
          const idsOffset = Number(BigInt("0x" + data.slice(0, 64)));
          const valsOffset = Number(BigInt("0x" + data.slice(64, 128)));
          const idsLen = Number(BigInt("0x" + data.slice(idsOffset * 2, idsOffset * 2 + 64)));

          for (let i = 0; i < idsLen; i++) {
            const idStart = (idsOffset + 32 + i * 32) * 2;
            const valStart = (valsOffset + 32 + i * 32) * 2;
            if (idStart + 64 > data.length || valStart + 64 > data.length) break;

            const tokenId = hexToDecimal("0x" + data.slice(idStart, idStart + 64));
            const amountRaw = hexToDecimal("0x" + data.slice(valStart, valStart + 64));

            events.push({
              kind: "erc1155-transfer",
              token: tokenAddr,
              tokenSymbol: meta?.symbol ?? null,
              tokenDecimals: null,
              amountFormatted: meta
                ? `${amountRaw}x ${meta.symbol} #${tokenId}`
                : `${amountRaw}x #${tokenId}`,
              amountRaw,
              from,
              to,
              direction: getDirection(from, to, safeAddress),
              tokenId,
            });
          }
        } catch {
          // Malformed batch data, skip silently
        }
        break;
      }

      case DEPOSIT_TOPIC: {
        if (log.topics.length < 2) break;
        const dst = topicToAddress(log.topics[1]);
        const amountRaw = log.data.length >= 66
          ? hexToDecimal(log.data.slice(0, 66))
          : "0";

        events.push({
          kind: "wrap",
          token: tokenAddr,
          tokenSymbol: meta?.symbol ?? null,
          tokenDecimals: meta?.decimals ?? null,
          amountFormatted: meta
            ? formatAmount(amountRaw, meta.decimals, meta.symbol)
            : amountRaw,
          amountRaw,
          from: dst,
          to: tokenAddr,
          direction: getDirection(dst, tokenAddr, safeAddress),
        });
        break;
      }

      case WITHDRAWAL_TOPIC: {
        if (log.topics.length < 2) break;
        const src = topicToAddress(log.topics[1]);
        const amountRaw = log.data.length >= 66
          ? hexToDecimal(log.data.slice(0, 66))
          : "0";

        events.push({
          kind: "unwrap",
          token: tokenAddr,
          tokenSymbol: meta?.symbol ?? null,
          tokenDecimals: meta?.decimals ?? null,
          amountFormatted: meta
            ? formatAmount(amountRaw, meta.decimals, meta.symbol)
            : amountRaw,
          amountRaw,
          from: tokenAddr,
          to: src,
          direction: getDirection(tokenAddr, src, safeAddress),
        });
        break;
      }
    }
  }

  return events;
}

/**
 * Decode native value transfers (ETH, xDAI, etc.) into DecodedEvent entries.
 *
 * These come from the `callTracer`'s call frames, each CALL/CREATE with
 * a non-zero `value` represents a native token movement during execution.
 *
 * @param transfers    - Native transfers extracted from the call trace.
 * @param safeAddress  - The Safe wallet address (for determining direction).
 * @param nativeSymbol - Native token symbol (e.g. "ETH", "xDAI"). Defaults to "ETH".
 */
export function decodeNativeTransfers(
  transfers: NativeTransfer[],
  safeAddress?: string,
  nativeSymbol: string = "ETH",
): DecodedEvent[] {
  return transfers.map((t) => {
    const from = t.from.toLowerCase();
    const to = t.to.toLowerCase();
    return {
      kind: "native-transfer" as const,
      token: "0x0000000000000000000000000000000000000000",
      tokenSymbol: nativeSymbol,
      tokenDecimals: 18,
      amountFormatted: formatAmount(t.value, 18, nativeSymbol),
      amountRaw: t.value,
      from,
      to,
      direction: getDirection(from, to, safeAddress),
    };
  });
}
