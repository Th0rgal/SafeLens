/**
 * ERC-20 storage slot decoder.
 *
 * Correlates simulation state diffs with decoded events to identify
 * proven balance and allowance changes at the storage level.
 *
 * Approach: for each Transfer/Approval event, compute candidate storage
 * slot keys across known ERC-20 layouts and check if any match the
 * observed state diffs. When a match is found, the before/after values
 * from the state diff provide **proven** post-state balances/allowances
 * — not just event heuristics.
 *
 * This is the foundation for issue #105: replacing event-only approval
 * heuristics with proven post-state values.
 */

import {
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import type { StateDiffEntry } from "../types";
import type { DecodedEvent } from "./event-decoder";
import { formatTokenAmount } from "./format";

// ── ERC-20 storage layout definitions ──────────────────────────────

/**
 * Known ERC-20 storage layouts.
 *
 * Different token implementations use different slot numbers for
 * their `balanceOf` and `allowance` mappings. We try all known
 * layouts and match against observed state diffs.
 */
interface ERC20StorageLayout {
  name: string;
  /** Slot number for `mapping(address => uint256) balanceOf` */
  balanceSlot: bigint;
  /** Slot number for `mapping(address => mapping(address => uint256)) allowance` */
  allowanceSlot: bigint;
}

const ERC20_LAYOUTS: ERC20StorageLayout[] = [
  // OpenZeppelin ERC20 (v3/v4/v5), most common layout
  { name: "oz", balanceSlot: 0n, allowanceSlot: 1n },
  // Vyper default (e.g. some Curve tokens)
  { name: "vyper", balanceSlot: 1n, allowanceSlot: 2n },
  // DAI and MakerDAO tokens
  { name: "dai", balanceSlot: 2n, allowanceSlot: 3n },
  // WETH (balance at slot 3, no standard allowance — but try 4)
  { name: "weth", balanceSlot: 3n, allowanceSlot: 4n },
  // USDC / bridged tokens behind proxies (slot 9/10)
  { name: "usdc-proxy", balanceSlot: 9n, allowanceSlot: 10n },
];

// ── Slot computation ────────────────────────────────────────────────

// Cache parsed ABI parameters to avoid re-parsing on every call
const abiParams = parseAbiParameters("address, uint256");

/**
 * Compute the storage slot for a simple mapping(address => T) at a given base slot.
 * Solidity: keccak256(abi.encode(key, slot))
 */
function computeMappingSlot(key: Address, baseSlot: bigint): Hex {
  return keccak256(encodeAbiParameters(abiParams, [key, baseSlot]));
}

/**
 * Compute the storage slot for a nested mapping(address => mapping(address => T)).
 * Solidity: keccak256(abi.encode(innerKey, keccak256(abi.encode(outerKey, slot))))
 */
function computeNestedMappingSlot(
  outerKey: Address,
  innerKey: Address,
  baseSlot: bigint,
): Hex {
  const outerSlot = computeMappingSlot(outerKey, baseSlot);
  return keccak256(
    encodeAbiParameters(abiParams, [innerKey, BigInt(outerSlot)]),
  );
}

// ── Result types ────────────────────────────────────────────────────

/** A proven ERC-20 balance change backed by a storage diff. */
export type ProvenBalanceChange = {
  /** Token contract address. */
  token: string;
  /** Resolved token symbol, or null. */
  tokenSymbol: string | null;
  /** Token decimals, or null if unknown. */
  tokenDecimals: number | null;
  /** Account whose balance changed. */
  account: string;
  /** Balance before execution (raw uint256 as hex). */
  before: string;
  /** Balance after execution (raw uint256 as hex). */
  after: string;
  /** Human-readable delta (e.g. "+1,500 DAI" or "-200 USDC"). */
  deltaFormatted: string;
  /** Which storage layout matched. */
  layoutName: string;
};

/** A proven ERC-20 allowance backed by a storage diff. */
export type ProvenAllowance = {
  /** Token contract address. */
  token: string;
  /** Resolved token symbol, or null. */
  tokenSymbol: string | null;
  /** Token decimals, or null if unknown. */
  tokenDecimals: number | null;
  /** Allowance owner. */
  owner: string;
  /** Allowance spender. */
  spender: string;
  /** Allowance value before execution (raw uint256 as hex). */
  before: string;
  /** Allowance value after execution (raw uint256 as hex). */
  after: string;
  /** Human-readable post-state allowance (e.g. "0", "Unlimited USDC"). */
  afterFormatted: string;
  /** Which storage layout matched. */
  layoutName: string;
};

/** Combined result of ERC-20 slot decoding. */
export type SlotDecoderResult = {
  /** Proven balance changes correlated with Transfer events. */
  balanceChanges: ProvenBalanceChange[];
  /** Proven allowances correlated with Approval events. */
  allowances: ProvenAllowance[];
};

// ── Formatting helpers ──────────────────────────────────────────────

const MAX_UINT256 = (1n << 256n) - 1n;

function hexToUint256(hex: string): bigint {
  if (!hex || hex === "0x" || hex === "0x" + "00".repeat(32)) return 0n;
  return BigInt(hex);
}

function formatDelta(
  before: bigint,
  after: bigint,
  decimals: number | null,
  symbol: string | null,
): string {
  const delta = after - before;
  if (delta === 0n) return symbol ? `0 ${symbol}` : "0";
  const sign = delta > 0n ? "+" : "-";
  const absDelta = delta < 0n ? -delta : delta;
  return `${sign}${formatTokenAmount(absDelta, decimals, symbol)}`;
}

function formatAllowanceAfter(
  after: bigint,
  decimals: number | null,
  symbol: string | null,
): string {
  if (after === 0n) return "0";
  if (after === MAX_UINT256) return `Unlimited${symbol ? ` ${symbol}` : ""}`;
  return formatTokenAmount(after, decimals, symbol);
}

// ── Main decoder ────────────────────────────────────────────────────

/**
 * Decode ERC-20 balance and allowance changes from state diffs,
 * correlating with Transfer/Approval events.
 *
 * For each event, candidate storage slot keys are computed across all
 * known ERC-20 layouts. If a candidate key matches an observed state
 * diff on the token contract, the before/after values are extracted
 * as proven post-state data.
 *
 * @param stateDiffs  - Storage slot changes from the simulation.
 * @param events      - Decoded simulation events (transfers, approvals).
 * @returns Proven balance changes and allowances.
 */
export function decodeERC20StateDiffs(
  stateDiffs: StateDiffEntry[] | undefined,
  events: DecodedEvent[],
): SlotDecoderResult {
  if (!stateDiffs || stateDiffs.length === 0) {
    return { balanceChanges: [], allowances: [] };
  }

  // Index state diffs by (address, key) for O(1) lookup
  const diffIndex = new Map<string, StateDiffEntry>();
  for (const diff of stateDiffs) {
    const indexKey = `${diff.address.toLowerCase()}:${diff.key.toLowerCase()}`;
    diffIndex.set(indexKey, diff);
  }

  const balanceChanges: ProvenBalanceChange[] = [];
  const allowances: ProvenAllowance[] = [];

  // Deduplicate: track which (token, account, layout) combos we've already matched
  const seenBalances = new Set<string>();
  const seenAllowances = new Set<string>();

  // ── Process Transfer events → balance changes ──────────────────
  for (const event of events) {
    if (event.kind !== "transfer") continue;
    const tokenLower = event.token.toLowerCase();

    for (const layout of ERC20_LAYOUTS) {
      // Check sender's balance slot
      for (const account of [event.from, event.to]) {
        const dedupeKey = `${tokenLower}:${account.toLowerCase()}:${layout.name}`;
        if (seenBalances.has(dedupeKey)) continue;

        const slotKey = computeMappingSlot(
          account.toLowerCase() as Address,
          layout.balanceSlot,
        ).toLowerCase();
        const diff = diffIndex.get(`${tokenLower}:${slotKey}`);
        if (diff) {
          seenBalances.add(dedupeKey);
          const before = hexToUint256(diff.before);
          const after = hexToUint256(diff.after);
          balanceChanges.push({
            token: tokenLower,
            tokenSymbol: event.tokenSymbol,
            tokenDecimals: event.tokenDecimals,
            account: account.toLowerCase(),
            before: diff.before,
            after: diff.after,
            deltaFormatted: formatDelta(
              before,
              after,
              event.tokenDecimals,
              event.tokenSymbol,
            ),
            layoutName: layout.name,
          });
        }
      }
    }
  }

  // ── Process Approval events → proven allowances ────────────────
  for (const event of events) {
    if (event.kind !== "approval") continue;
    const tokenLower = event.token.toLowerCase();
    const ownerLower = event.from.toLowerCase() as Address;
    const spenderLower = event.to.toLowerCase() as Address;

    for (const layout of ERC20_LAYOUTS) {
      const dedupeKey = `${tokenLower}:${ownerLower}:${spenderLower}:${layout.name}`;
      if (seenAllowances.has(dedupeKey)) continue;

      const slotKey = computeNestedMappingSlot(
        ownerLower,
        spenderLower,
        layout.allowanceSlot,
      ).toLowerCase();
      const diff = diffIndex.get(`${tokenLower}:${slotKey}`);
      if (diff) {
        seenAllowances.add(dedupeKey);
        const afterValue = hexToUint256(diff.after);
        allowances.push({
          token: tokenLower,
          tokenSymbol: event.tokenSymbol,
          tokenDecimals: event.tokenDecimals,
          owner: ownerLower,
          spender: spenderLower,
          before: diff.before,
          after: diff.after,
          afterFormatted: formatAllowanceAfter(
            afterValue,
            event.tokenDecimals,
            event.tokenSymbol,
          ),
          layoutName: layout.name,
        });
      }
    }
  }

  return { balanceChanges, allowances };
}

// ── Test-only exports ───────────────────────────────────────────────

export const __internal = {
  computeMappingSlot,
  computeNestedMappingSlot,
  ERC20_LAYOUTS,
  hexToUint256,
  formatDelta,
  formatAllowanceAfter,
};
