import { describe, it, expect } from "vitest";
import { interpretTransaction } from "../../interpret/index";

describe("ERC-7730 integration", () => {
  it("interprets a Lido stETH submit transaction via interpretTransaction", () => {
    const dataDecoded = {
      method: "submit",
      parameters: [
        {
          name: "_referral",
          type: "address",
          value: "0x0000000000000000000000000000000000000000",
        },
      ],
    };

    // Note: The bundled descriptor has Lido stETH at this address
    const result = interpretTransaction(
      dataDecoded,
      "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      0
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe("erc7730");
    expect(result!.protocol).toBe("Lido");
    expect(result!.action).toContain("Stake ETH");
  });

  it("returns null for an unknown contract", () => {
    const dataDecoded = {
      method: "someMethod",
      parameters: [],
    };

    const result = interpretTransaction(
      dataDecoded,
      "0x9999999999999999999999999999999999999999",
      0
    );

    expect(result).toBeNull();
  });

  it("hand-coded interpreters take precedence over ERC-7730", () => {
    // Test that CowSwap and Safe interpreters still work and take priority
    const safePolicyTx = {
      method: "changeThreshold",
      parameters: [
        {
          name: "_threshold",
          type: "uint256",
          value: "2",
        },
      ],
    };

    const result = interpretTransaction(
      safePolicyTx,
      "0xba260842B007FaB4119C9747D709119DE4257276",
      0
    );

    expect(result).not.toBeNull();
    // Should be Safe policy, not ERC-7730
    expect(result!.id).toBe("safe-policy");
  });
});
