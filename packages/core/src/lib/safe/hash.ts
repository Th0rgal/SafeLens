import { concat, encodeAbiParameters, keccak256, toHex } from "viem";
import type { Hash, Hex } from "viem";

/**
 * Detailed Safe transaction hash computation result
 * Includes intermediate hashes for hardware wallet verification
 */
export interface SafeTxHashDetails {
  /** Final EIP-712 hash (what hardware wallets display as "safeTxHash") */
  safeTxHash: Hash;
  /** Domain separator hash (for verification) */
  domainSeparator: Hash;
  /** Message hash (SafeTx struct hash, for verification) */
  messageHash: Hash;
}

/**
 * Compute Safe transaction hash using EIP-712
 * This follows the Safe contract's implementation
 *
 * Returns detailed hash information including intermediate hashes
 * for hardware wallet verification (Ledger/Trezor display these separately)
 */
export function computeSafeTxHashDetailed(params: {
  safeAddress: Hex;
  chainId: number;
  to: Hex;
  value: bigint;
  data: Hex;
  operation: 0 | 1;
  safeTxGas: bigint;
  baseGas: bigint;
  gasPrice: bigint;
  gasToken: Hex;
  refundReceiver: Hex;
  nonce: number;
}): SafeTxHashDetails {
  // EIP-712 domain separator
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        keccak256(toHex("EIP712Domain(uint256 chainId,address verifyingContract)")),
        BigInt(params.chainId),
        params.safeAddress,
      ]
    )
  );

  // Safe tx type hash
  const SAFE_TX_TYPEHASH = keccak256(
    toHex(
      "SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)"
    )
  );

  // Encode transaction data
  const safeTxHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
      ],
      [
        SAFE_TX_TYPEHASH,
        params.to,
        params.value,
        keccak256(params.data || "0x"),
        params.operation,
        params.safeTxGas,
        params.baseGas,
        params.gasPrice,
        params.gasToken,
        params.refundReceiver,
        BigInt(params.nonce),
      ]
    )
  );

  // Final EIP-712 hash: raw concatenation of "\x19\x01" || domainSeparator || safeTxHash
  const finalHash = keccak256(
    concat(["0x1901", domainSeparator, safeTxHash])
  );

  return {
    safeTxHash: finalHash,
    domainSeparator,
    messageHash: safeTxHash,
  };
}

/**
 * Compute Safe transaction hash using EIP-712 (simple version)
 * Returns only the final hash for backward compatibility
 */
export function computeSafeTxHash(params: {
  safeAddress: Hex;
  chainId: number;
  to: Hex;
  value: bigint;
  data: Hex;
  operation: 0 | 1;
  safeTxGas: bigint;
  baseGas: bigint;
  gasPrice: bigint;
  gasToken: Hex;
  refundReceiver: Hex;
  nonce: number;
}): Hash {
  return computeSafeTxHashDetailed(params).safeTxHash;
}

/**
 * Enhanced verification result with intermediate hashes
 */
export interface SafeTxHashVerification {
  valid: boolean;
  computed: Hash;
  expected: Hash;
  /** Intermediate hashes for hardware wallet verification */
  details?: SafeTxHashDetails;
}

/**
 * Verify that a computed Safe tx hash matches the expected hash
 * (simple version for backward compatibility)
 */
export function verifySafeTxHash(
  computed: Hash,
  expected: Hash
): { valid: boolean; computed: Hash; expected: Hash } {
  return {
    valid: computed.toLowerCase() === expected.toLowerCase(),
    computed,
    expected,
  };
}

/**
 * Verify Safe tx hash with detailed intermediate hashes
 * Useful for hardware wallet verification (Ledger/Trezor)
 */
export function verifySafeTxHashDetailed(
  details: SafeTxHashDetails,
  expected: Hash
): SafeTxHashVerification {
  return {
    valid: details.safeTxHash.toLowerCase() === expected.toLowerCase(),
    computed: details.safeTxHash,
    expected,
    details,
  };
}
