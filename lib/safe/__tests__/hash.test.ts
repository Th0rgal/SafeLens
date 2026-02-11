import { describe, it, expect } from "vitest";
import { computeSafeTxHash, verifySafeTxHash } from "../hash";
import type { Hex } from "viem";
import {
  COWSWAP_TWAP_TX,
  CHAIN_ID,
  EXPECTED_SAFE_TX_HASH,
} from "./fixtures/cowswap-twap-tx";

describe("computeSafeTxHash", () => {
  it("computes the correct EIP-712 hash for the CowSwap TWAP transaction", () => {
    const tx = COWSWAP_TWAP_TX;

    const computed = computeSafeTxHash({
      safeAddress: tx.safe as Hex,
      chainId: CHAIN_ID,
      to: tx.to as Hex,
      value: BigInt(tx.value),
      data: (tx.data || "0x") as Hex,
      operation: tx.operation,
      safeTxGas: BigInt(tx.safeTxGas),
      baseGas: BigInt(tx.baseGas),
      gasPrice: BigInt(tx.gasPrice),
      gasToken: tx.gasToken as Hex,
      refundReceiver: tx.refundReceiver as Hex,
      nonce: tx.nonce,
    });

    expect(computed.toLowerCase()).toBe(EXPECTED_SAFE_TX_HASH.toLowerCase());
  });

  it("returns a valid 32-byte hash", () => {
    const tx = COWSWAP_TWAP_TX;

    const computed = computeSafeTxHash({
      safeAddress: tx.safe as Hex,
      chainId: CHAIN_ID,
      to: tx.to as Hex,
      value: BigInt(tx.value),
      data: (tx.data || "0x") as Hex,
      operation: tx.operation,
      safeTxGas: BigInt(tx.safeTxGas),
      baseGas: BigInt(tx.baseGas),
      gasPrice: BigInt(tx.gasPrice),
      gasToken: tx.gasToken as Hex,
      refundReceiver: tx.refundReceiver as Hex,
      nonce: tx.nonce,
    });

    expect(computed).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it("produces different hashes for different nonces", () => {
    const tx = COWSWAP_TWAP_TX;
    const baseParams = {
      safeAddress: tx.safe as Hex,
      chainId: CHAIN_ID,
      to: tx.to as Hex,
      value: BigInt(tx.value),
      data: (tx.data || "0x") as Hex,
      operation: tx.operation as 0 | 1,
      safeTxGas: BigInt(tx.safeTxGas),
      baseGas: BigInt(tx.baseGas),
      gasPrice: BigInt(tx.gasPrice),
      gasToken: tx.gasToken as Hex,
      refundReceiver: tx.refundReceiver as Hex,
    };

    const hash1 = computeSafeTxHash({ ...baseParams, nonce: 28 });
    const hash2 = computeSafeTxHash({ ...baseParams, nonce: 29 });

    expect(hash1).not.toBe(hash2);
  });

  it("produces different hashes for different chains", () => {
    const tx = COWSWAP_TWAP_TX;
    const baseParams = {
      safeAddress: tx.safe as Hex,
      to: tx.to as Hex,
      value: BigInt(tx.value),
      data: (tx.data || "0x") as Hex,
      operation: tx.operation as 0 | 1,
      safeTxGas: BigInt(tx.safeTxGas),
      baseGas: BigInt(tx.baseGas),
      gasPrice: BigInt(tx.gasPrice),
      gasToken: tx.gasToken as Hex,
      refundReceiver: tx.refundReceiver as Hex,
      nonce: tx.nonce,
    };

    const hashMainnet = computeSafeTxHash({ ...baseParams, chainId: 1 });
    const hashArbitrum = computeSafeTxHash({ ...baseParams, chainId: 42161 });

    expect(hashMainnet).not.toBe(hashArbitrum);
  });
});

describe("verifySafeTxHash", () => {
  it("returns valid:true for matching hashes", () => {
    const hash =
      "0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17" as Hex;
    const result = verifySafeTxHash(hash, hash);

    expect(result.valid).toBe(true);
    expect(result.computed).toBe(hash);
    expect(result.expected).toBe(hash);
  });

  it("returns valid:true for case-insensitive match", () => {
    const lower =
      "0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17" as Hex;
    const upper =
      "0x8BCBA9ED52545BDC89EEBC015757CDA83C2468D3F225CEA01C2A844B8A15CF17" as Hex;
    const result = verifySafeTxHash(lower, upper);

    expect(result.valid).toBe(true);
  });

  it("returns valid:false for mismatching hashes", () => {
    const hash1 =
      "0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17" as Hex;
    const hash2 =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
    const result = verifySafeTxHash(hash1, hash2);

    expect(result.valid).toBe(false);
  });
});
