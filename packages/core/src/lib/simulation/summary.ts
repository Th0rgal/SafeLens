import type { SimulationLog, NativeTransferEntry } from "../types";
import { decodeSimulationEvents, decodeNativeTransfers } from "./event-decoder";

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
  options: { nativeTransfers?: NativeTransferEntry[]; nativeSymbol?: string; maxTransferPreviews?: number } = {}
): SimulationEventsSummary {
  const logEvents = decodeSimulationEvents(logs, safeAddress, chainId);
  const nativeEvents = options.nativeTransfers?.length
    ? decodeNativeTransfers(options.nativeTransfers, safeAddress ?? "", options.nativeSymbol ?? "ETH")
    : [];
  const decodedEvents = [...nativeEvents, ...logEvents];
  const transferEvents = decodedEvents.filter((event) => event.kind === "transfer");
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
