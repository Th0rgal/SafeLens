import { encodeAbiParameters, keccak256, toHex } from "viem";
import type { Hash, Hex } from "viem";

/**
 * Compute Safe transaction hash using EIP-712
 * This follows the Safe contract's implementation
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

  // Final EIP-712 hash
  const finalHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes1" }, { type: "bytes1" }, { type: "bytes32" }, { type: "bytes32" }],
      ["0x19" as Hex, "0x01" as Hex, domainSeparator, safeTxHash]
    )
  );

  return finalHash;
}

/**
 * Verify that a computed Safe tx hash matches the expected hash
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
