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
  computeProvenBalanceChanges,
  computePostStateEffects,
  summarizeStateDiffs,
  type SimulationEventsSummary,
  type SimulationTransferPreview,
  type RemainingApproval,
  type PostStateEffects,
  type StateDiffSummary,
  type ContractStateDiff,
} from "./summary";

export {
  decodeERC20StateDiffs,
  type ProvenBalanceChange,
  type ProvenAllowance,
  type SlotDecoderResult,
} from "./slot-decoder";
