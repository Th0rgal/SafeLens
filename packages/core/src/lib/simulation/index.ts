export {
  fetchSimulation,
  fetchSimulationWitness,
  type FetchSimulationOptions,
} from "./fetcher";

export {
  verifySimulation,
  type SimulationVerificationResult,
  type SimulationCheck,
} from "./verifier";

export {
  computeSimulationDigest,
  verifySimulationWitness,
  type SimulationWitnessVerificationResult,
  type SimulationWitnessCheck,
} from "./witness-verifier";

export {
  decodeSimulationEvents,
  decodeNativeTransfers,
  type DecodedEvent,
  type DecodedEventKind,
} from "./event-decoder";

export {
  summarizeSimulationEvents,
  computeRemainingApprovals,
  type SimulationEventsSummary,
  type SimulationTransferPreview,
  type RemainingApproval,
} from "./summary";
