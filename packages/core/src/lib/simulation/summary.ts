import type { SimulationLog, NativeTransfer } from "../types";
import { decodeSimulationEvents, decodeNativeTransfers, type DecodedEvent } from "./event-decoder";

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
};

/**
 * Compute token approvals that remain non-zero after execution.
 *
 * For each (token, spender) pair, only the last Approval event matters
 * (it overwrites any previous allowance). If the final amount is zero,
 * the approval was revoked during execution and is excluded.
 */
export function computeRemainingApprovals(
  events: DecodedEvent[],
): RemainingApproval[] {
  const lastByPair = new Map<string, DecodedEvent>();
  for (const event of events) {
    if (event.kind === "approval") {
      lastByPair.set(`${event.token}:${event.to}`, event);
    }
  }

  return Array.from(lastByPair.values())
    .filter((event) => event.amountRaw !== "0")
    .map((event) => ({
      token: event.token,
      tokenSymbol: event.tokenSymbol,
      spender: event.to,
      amountFormatted: event.amountFormatted,
      isUnlimited: event.amountFormatted.toLowerCase().includes("unlimited"),
    }));
}
