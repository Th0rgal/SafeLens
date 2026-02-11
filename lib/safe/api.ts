import { SafeTransaction, safeTransactionSchema } from "../types";
import { getSafeApiUrl } from "./url-parser";

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
