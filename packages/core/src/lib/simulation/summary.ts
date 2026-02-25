import type { SimulationLog, NativeTransfer, StateDiffEntry } from "../types";
import { decodeSimulationEvents, decodeNativeTransfers, type DecodedEvent } from "./event-decoder";
import { decodeERC20StateDiffs, type ProvenAllowance } from "./slot-decoder";

export type SimulationTransferPreview = {
  direction: "send" | "receive" | "internal";
  amountFormatted: string;
  token: string;
  tokenSymbol: string | null;
  counterparty: string;
  counterpartyRole: "to" | "from" | "at";
};

export type SimulationEventsSummary = {
  totalEvents: number;
  transfersOut: number;
  transfersIn: number;
  approvals: number;
  unlimitedApprovals: number;
  transferPreviews: SimulationTransferPreview[];
};

export function summarizeSimulationEvents(
  logs: SimulationLog[],
  safeAddress?: string,
  chainId?: number,
  options: {
    maxTransferPreviews?: number;
    /** Native value transfers from the call trace. */
    nativeTransfers?: NativeTransfer[];
    /** Native token symbol for display (e.g. "ETH", "xDAI"). Defaults to "ETH". */
    nativeTokenSymbol?: string;
  } = {}
): SimulationEventsSummary {
  const decodedEvents = decodeSimulationEvents(logs, safeAddress, chainId);

  // Prepend native value transfers (from call trace) so they appear first.
  if (options.nativeTransfers && options.nativeTransfers.length > 0) {
    const nativeEvents = decodeNativeTransfers(
      options.nativeTransfers,
      safeAddress,
      options.nativeTokenSymbol ?? "ETH",
    );
    decodedEvents.unshift(...nativeEvents);
  }

  const transferEvents = decodedEvents.filter(
    (event) => event.kind === "transfer" || event.kind === "native-transfer"
  );
  const approvals = decodedEvents.filter((event) => event.kind === "approval");
  const maxTransferPreviews = options.maxTransferPreviews ?? 5;

  const transferPreviews: SimulationTransferPreview[] = transferEvents
    .slice(0, maxTransferPreviews)
    .map((event) => ({
      direction: event.direction,
      amountFormatted: event.amountFormatted,
      token: event.token,
      tokenSymbol: event.tokenSymbol,
      counterparty:
        event.direction === "send"
          ? event.to
          : event.direction === "receive"
            ? event.from
            : event.to,
      counterpartyRole:
        event.direction === "send"
          ? "to"
          : event.direction === "receive"
            ? "from"
            : "at",
    }));

  const transfersOut = transferEvents.filter((event) => event.direction === "send").length;
  const transfersIn = transferEvents.filter((event) => event.direction === "receive").length;
  const unlimitedApprovals = approvals.filter((event) =>
    event.amountFormatted.toLowerCase().includes("unlimited")
  ).length;

  return {
    totalEvents: decodedEvents.length,
    transfersOut,
    transfersIn,
    approvals: approvals.length,
    unlimitedApprovals,
    transferPreviews,
  };
}

export type RemainingApproval = {
  token: string;
  tokenSymbol: string | null;
  spender: string;
  amountFormatted: string;
  isUnlimited: boolean;
  /** "event" when based on Approval events only, "state-diff" when proven from storage. */
  source: "event" | "state-diff";
};

/**
 * Compute token approvals that remain non-zero after execution.
 *
 * For each (token, spender) pair, only the last Approval event matters
 * (it overwrites any previous allowance). If the final amount is zero,
 * the approval was revoked during execution and is excluded.
 *
 * When `stateDiffs` are provided, the function attempts to correlate
 * Approval events with proven storage-level data. For (token, spender)
 * pairs where a state diff match is found, the proven post-state value
 * replaces the event-based heuristic — correctly handling cases where
 * allowances are consumed via `transferFrom` without a new `Approval` event.
 */
export function computeRemainingApprovals(
  events: DecodedEvent[],
  stateDiffs?: StateDiffEntry[],
): RemainingApproval[] {
  // Try to decode proven allowances from state diffs
  const provenResult = decodeERC20StateDiffs(stateDiffs, events);
  const provenByPair = new Map<string, ProvenAllowance>();
  for (const proven of provenResult.allowances) {
    // Keep only the first match per (token, owner, spender) — layouts are
    // tried in priority order so the first match is the best one
    const key = `${proven.token}:${proven.owner}:${proven.spender}`;
    if (!provenByPair.has(key)) {
      provenByPair.set(key, proven);
    }
  }

  // Build event-based approvals as before
  const lastByPair = new Map<string, DecodedEvent>();
  for (const event of events) {
    if (event.kind === "approval") {
      lastByPair.set(`${event.token}:${event.to}`, event);
    }
  }

  const results: RemainingApproval[] = [];
  const seen = new Set<string>();

  // First pass: emit proven approvals (state-diff source)
  for (const [key, proven] of provenByPair) {
    const pairKey = `${proven.token}:${proven.spender}`;
    seen.add(pairKey);

    const afterValue = proven.after === ("0x" + "00".repeat(32))
      ? 0n
      : BigInt(proven.after);

    if (afterValue === 0n) continue; // revoked

    results.push({
      token: proven.token,
      tokenSymbol: proven.tokenSymbol,
      spender: proven.spender,
      amountFormatted: proven.afterFormatted,
      isUnlimited: proven.afterFormatted.toLowerCase().includes("unlimited"),
      source: "state-diff",
    });
  }

  // Second pass: emit event-based approvals for pairs without proven data
  for (const event of lastByPair.values()) {
    const pairKey = `${event.token}:${event.to}`;
    if (seen.has(pairKey)) continue; // already handled by proven data

    if (event.amountRaw === "0") continue;

    results.push({
      token: event.token,
      tokenSymbol: event.tokenSymbol,
      spender: event.to,
      amountFormatted: event.amountFormatted,
      isUnlimited: event.amountFormatted.toLowerCase().includes("unlimited"),
      source: "event",
    });
  }

  return results;
}

// ── State diff summary ────────────────────────────────────────────

/** Per-contract grouping of storage slot changes. */
export type ContractStateDiff = {
  /** Contract address (lowercase, checksumless). */
  address: string;
  /** Resolved token symbol if this is a known token contract, otherwise null. */
  tokenSymbol: string | null;
  /** Number of storage slots that changed on this contract. */
  slotsChanged: number;
  /** True when this contract emitted at least one decoded event (Transfer/Approval/etc.). */
  hasEvents: boolean;
};

/** Aggregate summary of storage-level state changes. */
export type StateDiffSummary = {
  /** Total number of storage slots changed across all contracts. */
  totalSlotsChanged: number;
  /** Number of distinct contracts whose storage was modified. */
  contractsChanged: number;
  /** Per-contract breakdown, sorted by slotsChanged descending. */
  contracts: ContractStateDiff[];
  /** Number of contracts that had storage changes but emitted no decoded events. */
  silentContracts: number;
};

/**
 * Summarize storage-level state diffs, correlating with decoded events.
 *
 * Contracts that modified storage without emitting any decoded events are
 * flagged as "silent" — a signal that the transaction has effects not
 * visible from event logs alone (e.g. allowance changes via transferFrom,
 * or direct storage writes via delegatecall).
 *
 * @param stateDiffs  - Storage slot changes from the simulation.
 * @param events      - Decoded events (transfers, approvals, etc.) for cross-reference.
 * @param safeAddress - The Safe wallet address (excluded from the summary since its
 *                      storage changes are simulation-override artifacts).
 */
export function summarizeStateDiffs(
  stateDiffs: StateDiffEntry[] | undefined,
  events: DecodedEvent[],
  safeAddress?: string,
): StateDiffSummary {
  if (!stateDiffs || stateDiffs.length === 0) {
    return {
      totalSlotsChanged: 0,
      contractsChanged: 0,
      contracts: [],
      silentContracts: 0,
    };
  }

  const safeLower = safeAddress?.toLowerCase();

  // Group diffs by contract address, excluding the Safe itself
  const byContract = new Map<string, number>();
  for (const diff of stateDiffs) {
    const addr = diff.address.toLowerCase();
    if (addr === safeLower) continue;
    byContract.set(addr, (byContract.get(addr) ?? 0) + 1);
  }

  // Collect all contract addresses that emitted decoded events
  const eventContracts = new Set<string>();
  for (const event of events) {
    eventContracts.add(event.token.toLowerCase());
  }

  // Build token symbol lookup from events
  const tokenSymbols = new Map<string, string>();
  for (const event of events) {
    if (event.tokenSymbol) {
      tokenSymbols.set(event.token.toLowerCase(), event.tokenSymbol);
    }
  }

  const contracts: ContractStateDiff[] = [];
  for (const [address, slotsChanged] of byContract) {
    contracts.push({
      address,
      tokenSymbol: tokenSymbols.get(address) ?? null,
      slotsChanged,
      hasEvents: eventContracts.has(address),
    });
  }

  // Sort by slotsChanged descending for consistent ordering
  contracts.sort((a, b) => b.slotsChanged - a.slotsChanged);

  const totalSlotsChanged = contracts.reduce((sum, c) => sum + c.slotsChanged, 0);
  const silentContracts = contracts.filter((c) => !c.hasEvents).length;

  return {
    totalSlotsChanged,
    contractsChanged: contracts.length,
    contracts,
    silentContracts,
  };
}
