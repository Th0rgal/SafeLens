export {
  fetchSimulation,
  type FetchSimulationOptions,
} from "./fetcher";

export {
  verifySimulation,
  type SimulationVerificationResult,
  type SimulationCheck,
} from "./verifier";

export {
  decodeSimulationEvents,
  decodeNativeTransfers,
  computeRemainingApprovals,
  type DecodedEvent,
  type DecodedEventKind,
  type NativeTransfer,
  type RemainingApproval,
} from "./event-decoder";

export {
  summarizeSimulationEvents,
  type SimulationEventsSummary,
  type SimulationTransferPreview,
} from "./summary";
