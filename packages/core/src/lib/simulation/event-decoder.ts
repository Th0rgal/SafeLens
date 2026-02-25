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

// ── Well-known tokens ─────────────────────────────────────────────────

interface TokenMeta {
  symbol: string;
  decimals: number;
}

/** Key: `chainId:lowercaseAddress`. If chainId is unknown, omit the prefix. */
const WELL_KNOWN_TOKENS: Record<string, TokenMeta> = {
  // Ethereum mainnet
  "1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", decimals: 18 },
  "1:0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18 },
  "1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
  "1:0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6 },
  "1:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { symbol: "WBTC", decimals: 8 },
  "1:0x514910771af9ca656af840dff83e8264ecf986ca": { symbol: "LINK", decimals: 18 },
  "1:0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": { symbol: "AAVE", decimals: 18 },
  "1:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { symbol: "UNI", decimals: 18 },
  "1:0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2": { symbol: "MKR", decimals: 18 },
  "1:0xae7ab96520de3a18e5e111b5eaab095312d7fe84": { symbol: "stETH", decimals: 18 },
  "1:0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": { symbol: "wstETH", decimals: 18 },
  "1:0xd533a949740bb3306d119cc777fa900ba034cd52": { symbol: "CRV", decimals: 18 },
  "1:0xba100000625a3754423978a60c9317c58a424e3d": { symbol: "BAL", decimals: 18 },
  "1:0xdef1ca1fb7fbcdc777520aa7f396b4e015f497ab": { symbol: "COW", decimals: 18 },
  // Gnosis chain
  "100:0xe91d153e0b41518a2ce8dd3d7944fa863463a97d": { symbol: "WXDAI", decimals: 18 },
  "100:0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1": { symbol: "WETH", decimals: 18 },
  "100:0xddafbb505ad214d7b80b1f830fccc89b60fb7a83": { symbol: "USDC", decimals: 6 },
  "100:0x4ecaba5870353805a9f068101a40e0f32ed605c6": { symbol: "USDT", decimals: 6 },
  "100:0x177127622c4a00f3d409b75571e12cb3c8973d3c": { symbol: "COW", decimals: 18 },
  // Polygon
  "137:0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270": { symbol: "WPOL", decimals: 18 },
  "137:0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": { symbol: "WETH", decimals: 18 },
  "137:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": { symbol: "USDC", decimals: 6 },
  "137:0xc2132d05d31c914a87c6611c10748aeb04b58e8f": { symbol: "USDT", decimals: 6 },
  // Arbitrum One
  "42161:0x82af49447d8a07e3bd95bd0d56f35241523fbab1": { symbol: "WETH", decimals: 18 },
  "42161:0xaf88d065e77c8cc2239327c5edb3a432268e5831": { symbol: "USDC", decimals: 6 },
  "42161:0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": { symbol: "USDT", decimals: 6 },
  // Optimism
  "10:0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
  "10:0x0b2c639c533813f4aa9d7837caf62653d097ff85": { symbol: "USDC", decimals: 6 },
  "10:0x94b008aa00579c1307b0ef2c499ad98a8ce58e58": { symbol: "USDT", decimals: 6 },
  "10:0xda10009cbd5d07dd0cecc66161fc93d7c9000da1": { symbol: "DAI", decimals: 18 },
  // Base
  "8453:0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
  "8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
  // Linea
  "59144:0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f": { symbol: "WETH", decimals: 18 },
  "59144:0x176211869ca2b568f2a7d4ee941e073a821ee1ff": { symbol: "USDC", decimals: 6 },
  "59144:0xa219439258ca9da29e9cc4ce5596924745e12b93": { symbol: "USDT", decimals: 6 },
  // Sepolia
  "11155111:0xfff9976782d46cc05630d1f6ebab18b2324d6b14": { symbol: "WETH", decimals: 18 },
};

// Fallback: address-only lookup (no chain)
const WELL_KNOWN_TOKENS_NO_CHAIN: Record<string, TokenMeta> = {
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", decimals: 18 },
  "0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18 },
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
  "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6 },
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { symbol: "WBTC", decimals: 8 },
};

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

/** Look up token metadata. */
function resolveTokenMeta(address: string, chainId?: number): TokenMeta | null {
  const lower = address.toLowerCase();
  if (chainId !== undefined) {
    const keyed = WELL_KNOWN_TOKENS[`${chainId}:${lower}`];
    if (keyed) return keyed;
  }
  return WELL_KNOWN_TOKENS_NO_CHAIN[lower] ?? null;
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
