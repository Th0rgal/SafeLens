import { keccak256, stringToHex, type Address, type Hex } from "viem";
import type { OnchainPolicyProof, Simulation, SimulationWitness } from "../types";
import {
  normalizeStorageSlotKey,
  verifyAccountProof,
  verifyStorageProof,
  type AccountProofInput,
  type StorageProofInput,
} from "../proof/mpt";

export interface SimulationWitnessCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface SimulationWitnessVerificationResult {
  valid: boolean;
  errors: string[];
  checks: SimulationWitnessCheck[];
}

function normalizeValue(raw: Hex): Hex {
  const noPrefix = raw.startsWith("0x") ? raw.slice(2) : raw;
  return `0x${noPrefix.padStart(64, "0")}` as Hex;
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function toStorageProofInput(
  proof: SimulationWitness["safeAccountProof"]["storageProof"][number]
): StorageProofInput {
  return {
    key: normalizeStorageSlotKey(proof.key as Hex),
    value: normalizeValue(proof.value as Hex),
    proof: proof.proof as Hex[],
  };
}

export function computeSimulationDigest(simulation: Simulation): Hex {
  const payload = {
    success: simulation.success,
    returnData: simulation.returnData ?? null,
    gasUsed: simulation.gasUsed,
    logs: simulation.logs.map((log) => ({
      address: normalizeAddress(log.address),
      topics: log.topics.map((topic) => topic.toLowerCase()),
      data: log.data.toLowerCase(),
    })),
    nativeTransfers: (simulation.nativeTransfers ?? []).map((transfer) => ({
      from: normalizeAddress(transfer.from),
      to: normalizeAddress(transfer.to),
      value: transfer.value,
    })),
    stateDiffs: (simulation.stateDiffs ?? []).map((diff) => ({
      address: normalizeAddress(diff.address),
      key: diff.key.toLowerCase(),
      before: diff.before.toLowerCase(),
      after: diff.after.toLowerCase(),
    })),
    blockNumber: simulation.blockNumber,
    traceAvailable: simulation.traceAvailable ?? null,
  };

  return keccak256(stringToHex(JSON.stringify(payload)));
}

export function verifySimulationWitness(
  simulation: Simulation,
  witness: SimulationWitness,
  context: {
    chainId: number;
    safeAddress: Address;
    onchainPolicyProof?: OnchainPolicyProof;
  }
): SimulationWitnessVerificationResult {
  const checks: SimulationWitnessCheck[] = [];
  const errors: string[] = [];

  const chainMatch = witness.chainId === context.chainId;
  checks.push({
    id: "chain-id",
    label: "Witness chain id",
    passed: chainMatch,
    detail: chainMatch
      ? `Witness chain ${witness.chainId}`
      : `Mismatch: witness ${witness.chainId}, expected ${context.chainId}`,
  });
  if (!chainMatch) {
    errors.push(`Witness chain id mismatch: ${witness.chainId} != ${context.chainId}`);
  }

  const safeMatch =
    normalizeAddress(witness.safeAddress) === normalizeAddress(context.safeAddress);
  checks.push({
    id: "safe-address",
    label: "Witness safe address",
    passed: safeMatch,
    detail: safeMatch
      ? witness.safeAddress
      : `Mismatch: witness ${witness.safeAddress}, expected ${context.safeAddress}`,
  });
  if (!safeMatch) {
    errors.push(
      `Witness safeAddress mismatch: ${witness.safeAddress} != ${context.safeAddress}`
    );
  }

  const blockMatch = witness.blockNumber === simulation.blockNumber;
  checks.push({
    id: "block-number",
    label: "Witness block pin",
    passed: blockMatch,
    detail: blockMatch
      ? `Pinned to block ${witness.blockNumber}`
      : `Mismatch: witness ${witness.blockNumber}, simulation ${simulation.blockNumber}`,
  });
  if (!blockMatch) {
    errors.push(
      `Witness blockNumber mismatch: ${witness.blockNumber} != ${simulation.blockNumber}`
    );
  }

  const digest = computeSimulationDigest(simulation);
  const digestMatch = digest.toLowerCase() === witness.simulationDigest.toLowerCase();
  checks.push({
    id: "simulation-digest",
    label: "Simulation payload digest",
    passed: digestMatch,
    detail: digestMatch
      ? "Witness digest matches simulation payload."
      : "Witness digest does not match simulation payload.",
  });
  if (!digestMatch) {
    errors.push("Simulation digest mismatch between witness and simulation payload.");
  }

  const onchainProof = context.onchainPolicyProof;
  if (onchainProof) {
    const rootMatch =
      witness.stateRoot.toLowerCase() === onchainProof.stateRoot.toLowerCase();
    const proofBlockMatch = witness.blockNumber === onchainProof.blockNumber;
    checks.push({
      id: "policy-anchor",
      label: "Witness aligns with on-chain policy proof anchor",
      passed: rootMatch && proofBlockMatch,
      detail:
        rootMatch && proofBlockMatch
          ? `stateRoot/block match policy proof (${onchainProof.blockNumber})`
          : `Mismatch with policy proof anchor. witness=(${witness.blockNumber}, ${witness.stateRoot}) policy=(${onchainProof.blockNumber}, ${onchainProof.stateRoot})`,
    });
    if (!rootMatch || !proofBlockMatch) {
      errors.push("Witness does not align with onchainPolicyProof stateRoot/blockNumber.");
    }
  }

  const accountAddressMatch =
    normalizeAddress(witness.safeAccountProof.address) ===
    normalizeAddress(witness.safeAddress);
  checks.push({
    id: "account-proof-address",
    label: "Account proof address consistency",
    passed: accountAddressMatch,
    detail: accountAddressMatch
      ? witness.safeAccountProof.address
      : `Proof address ${witness.safeAccountProof.address} does not match witness safeAddress ${witness.safeAddress}`,
  });
  if (!accountAddressMatch) {
    errors.push("safeAccountProof.address does not match witness.safeAddress.");
  }

  const accountInput: AccountProofInput = {
    address: witness.safeAddress as Address,
    balance: witness.safeAccountProof.balance,
    codeHash: witness.safeAccountProof.codeHash as Hex,
    nonce: witness.safeAccountProof.nonce,
    storageHash: witness.safeAccountProof.storageHash as Hex,
    accountProof: witness.safeAccountProof.accountProof as Hex[],
    storageProof: witness.safeAccountProof.storageProof.map(toStorageProofInput),
  };

  const accountProofResult = verifyAccountProof(witness.stateRoot as Hex, accountInput);
  checks.push({
    id: "account-proof",
    label: "Safe account proof against witness state root",
    passed: accountProofResult.valid,
    detail: accountProofResult.valid
      ? "Account proof is valid."
      : accountProofResult.errors.join("; "),
  });
  if (!accountProofResult.valid) {
    errors.push(
      `Account proof verification failed: ${accountProofResult.errors.join("; ")}`
    );
  }

  let allStorageProofsValid = true;
  for (const storageProof of accountInput.storageProof) {
    const result = verifyStorageProof(
      witness.safeAccountProof.storageHash as Hex,
      storageProof
    );
    if (!result.valid) {
      allStorageProofsValid = false;
      errors.push(
        `Storage proof for key ${storageProof.key} failed: ${result.errors.join("; ")}`
      );
    }
  }

  checks.push({
    id: "storage-proofs",
    label: "Witness storage proofs against account storage root",
    passed: allStorageProofsValid,
    detail: allStorageProofsValid
      ? `${accountInput.storageProof.length} storage proof(s) verified`
      : "One or more storage proofs failed.",
  });

  let allOverridesProven = true;
  const proofsByKey = new Map(
    accountInput.storageProof.map((proof) => [
      normalizeStorageSlotKey(proof.key as Hex),
      normalizeValue(proof.value as Hex),
    ])
  );
  for (const slot of witness.overriddenSlots) {
    const normalizedKey = normalizeStorageSlotKey(slot.key as Hex);
    const provenValue = proofsByKey.get(normalizedKey);
    if (!provenValue) {
      allOverridesProven = false;
      errors.push(`Missing storage proof for overridden slot ${normalizedKey}.`);
    }
  }

  checks.push({
    id: "override-slots",
    label: "Overridden simulation slots are proven",
    passed: allOverridesProven,
    detail: allOverridesProven
      ? `${witness.overriddenSlots.length} overridden slot(s) are covered by proof`
      : "One or more overridden slots are missing from proof.",
  });

  return {
    valid: errors.length === 0,
    errors,
    checks,
  };
}
