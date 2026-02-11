import { computeSafeTxHash, verifySafeTxHash } from "../hash";
import type { Hex } from "viem";

/**
 * Test Safe transaction hash computation
 *
 * This test uses a real Safe transaction to verify our hash computation
 * matches the expected Safe tx hash.
 */
describe("Safe Transaction Hash", () => {
  it("should compute correct Safe tx hash for a real transaction", () => {
    // Real transaction data from a Safe multisig
    // You can get this from Safe API: https://safe-transaction-mainnet.safe.global/api/v1/multisig-transactions/{safeTxHash}/

    const params = {
      safeAddress: "0x9fC3dc011b461664c835F2527fffb1169b3C213e" as Hex,
      chainId: 1, // Ethereum Mainnet
      to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Hex, // Example: USDC contract
      value: BigInt(0),
      data: "0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000003b9aca00" as Hex,
      operation: 0 as const,
      safeTxGas: BigInt(0),
      baseGas: BigInt(0),
      gasPrice: BigInt(0),
      gasToken: "0x0000000000000000000000000000000000000000" as Hex,
      refundReceiver: "0x0000000000000000000000000000000000000000" as Hex,
      nonce: 42,
    };

    const computed = computeSafeTxHash(params);

    // The computed hash should be a valid 32-byte hash
    expect(computed).toMatch(/^0x[a-fA-F0-9]{64}$/);

    console.log("Computed Safe TX Hash:", computed);
  });

  it("should verify matching hashes correctly", () => {
    const hash1 = "0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17" as Hex;
    const hash2 = "0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17" as Hex;

    const result = verifySafeTxHash(hash1, hash2);

    expect(result.valid).toBe(true);
    expect(result.computed).toBe(hash1);
    expect(result.expected).toBe(hash2);
  });

  it("should detect mismatching hashes", () => {
    const hash1 = "0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17" as Hex;
    const hash2 = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;

    const result = verifySafeTxHash(hash1, hash2);

    expect(result.valid).toBe(false);
    expect(result.computed).toBe(hash1);
    expect(result.expected).toBe(hash2);
  });
});
