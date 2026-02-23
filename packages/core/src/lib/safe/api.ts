import { z } from "zod";
import { SafeTransaction, SafeTransactionList, safeTransactionSchema, safeTransactionListSchema } from "../types";
import { getSafeApiUrl } from "./url-parser";

// Minimal schema for the Safe info endpoint — only the fields we need.
// Validates nonce at the trust boundary to prevent a malicious API from
// injecting arbitrary values that would affect pending-transaction filtering.
const safeInfoNonceSchema = z.object({
  nonce: z.coerce.number().int().nonnegative(),
});

/**
 * Fetch a Safe transaction by its safe tx hash
 */
export async function fetchSafeTransaction(
  chainId: number,
  safeTxHash: string
): Promise<SafeTransaction> {
  const apiUrl = getSafeApiUrl(chainId);
  const url = `${apiUrl}/api/v1/multisig-transactions/${safeTxHash}/`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Transaction not found");
      }
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response with Zod
    const validated = safeTransactionSchema.parse(data);

    return validated;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch Safe transaction: ${error.message}`);
    }
    throw new Error("Failed to fetch Safe transaction");
  }
}

/**
 * Fetch the current on-chain nonce for a Safe
 */
export async function fetchSafeNonce(
  chainId: number,
  safeAddress: string
): Promise<number> {
  const apiUrl = getSafeApiUrl(chainId);
  const url = `${apiUrl}/api/v1/safes/${safeAddress}/`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Safe info: ${response.status}`);
  }

  const data = await response.json();
  const { nonce } = safeInfoNonceSchema.parse(data);
  return nonce;
}

/**
 * Fetch pending (unexecuted) transactions for a Safe,
 * filtering out superseded proposals (nonce < current on-chain nonce).
 */
export async function fetchPendingTransactions(
  chainId: number,
  safeAddress: string
): Promise<SafeTransaction[]> {
  const apiUrl = getSafeApiUrl(chainId);
  const txUrl = `${apiUrl}/api/v1/safes/${safeAddress}/multisig-transactions/?executed=false&ordering=-nonce&limit=20`;

  try {
    const [txResponse, currentNonce] = await Promise.all([
      fetch(txUrl),
      fetchSafeNonce(chainId, safeAddress),
    ]);

    if (!txResponse.ok) {
      if (txResponse.status === 404) {
        throw new Error("Safe not found");
      }
      throw new Error(`API request failed: ${txResponse.status} ${txResponse.statusText}`);
    }

    const data = await txResponse.json();
    const validated = safeTransactionListSchema.parse(data);

    return validated.results.filter((tx) => tx.nonce >= currentNonce);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch pending transactions: ${error.message}`);
    }
    throw new Error("Failed to fetch pending transactions");
  }
}
