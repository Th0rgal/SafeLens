import type { EvidencePackage, SafeTransaction } from "../types";
import type { Address } from "viem";
import { getSafeApiUrl } from "../safe/url-parser";
import {
  fetchOnchainPolicyProof,
  type FetchOnchainProofOptions,
} from "../proof";
import {
  fetchSimulation,
  type FetchSimulationOptions,
} from "../simulation";
import {
  fetchConsensusProof,
  type FetchConsensusProofOptions,
} from "../consensus";

/**
 * Create an evidence package from a Safe transaction
 */
export function createEvidencePackage(
  transaction: SafeTransaction,
  chainId: number,
  transactionUrl: string
): EvidencePackage {
  const evidence: EvidencePackage = {
    version: "1.0",
    safeAddress: transaction.safe,
    safeTxHash: transaction.safeTxHash,
    chainId,
    transaction: {
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
      operation: transaction.operation,
      nonce: transaction.nonce,
      safeTxGas: transaction.safeTxGas,
      baseGas: transaction.baseGas,
      gasPrice: transaction.gasPrice,
      gasToken: transaction.gasToken,
      refundReceiver: transaction.refundReceiver,
    },
    confirmations: transaction.confirmations.map((c) => ({
      owner: c.owner,
      signature: c.signature,
      submissionDate: c.submissionDate,
    })),
    confirmationsRequired: transaction.confirmationsRequired,
    ethereumTxHash: transaction.transactionHash,
    dataDecoded: transaction.dataDecoded ?? null,
    sources: {
      safeApiUrl: getSafeApiUrl(chainId),
      transactionUrl,
    },
    packagedAt: new Date().toISOString(),
  };

  return evidence;
}

/**
 * Enrich an evidence package with an on-chain policy proof.
 *
 * Fetches `eth_getProof` for the Safe at the latest (or specified) block,
 * walks the owner/module linked lists, and attaches the result as
 * `onchainPolicyProof`. Bumps version to "1.1".
 */
export async function enrichWithOnchainProof(
  evidence: EvidencePackage,
  options: FetchOnchainProofOptions = {}
): Promise<EvidencePackage> {
  const proof = await fetchOnchainPolicyProof(
    evidence.safeAddress as Address,
    evidence.chainId,
    options
  );

  return {
    ...evidence,
    version: "1.1",
    onchainPolicyProof: proof,
  };
}

/**
 * Enrich an evidence package with a transaction simulation.
 *
 * Simulates `execTransaction` via `eth_call` with storage overrides
 * (fake 1-of-1 owner) to reveal the transaction's success/revert status,
 * return data, gas usage, and event logs. Bumps version to "1.1".
 */
export async function enrichWithSimulation(
  evidence: EvidencePackage,
  options: FetchSimulationOptions = {}
): Promise<EvidencePackage> {
  const simulation = await fetchSimulation(
    evidence.safeAddress as Address,
    evidence.chainId,
    evidence.transaction,
    options
  );

  return {
    ...evidence,
    version: "1.1",
    simulation,
  };
}

/**
 * Enrich an evidence package with a consensus proof (Phase 4).
 *
 * Fetches light client data from a beacon chain RPC: bootstrap,
 * sync committee updates, and a finality update. These allow the
 * desktop verifier to cryptographically verify the state root against
 * Ethereum consensus (BLS sync committee signatures) without trusting
 * any RPC provider. Bumps version to "1.2".
 */
export async function enrichWithConsensusProof(
  evidence: EvidencePackage,
  options: FetchConsensusProofOptions = {}
): Promise<EvidencePackage> {
  const consensusProof = await fetchConsensusProof(
    evidence.chainId,
    options
  );

  return {
    ...evidence,
    version: "1.2",
    consensusProof,
  };
}

/**
 * Export evidence package as JSON string
 */
export function exportEvidencePackage(evidence: EvidencePackage): string {
  return JSON.stringify(evidence, null, 2);
}
