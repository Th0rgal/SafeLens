import { describe, it, expect } from "vitest";
import { createERC7730Interpreter } from "../interpreter";
import { buildIndex } from "../index";
import type { ERC7730Descriptor } from "../types";

describe("createERC7730Interpreter", () => {
  it("interprets a Lido stETH submit transaction", () => {
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" }],
        },
      },
      metadata: {
        owner: "Lido",
        token: {
          name: "Liquid staked Ether 2.0",
          ticker: "stETH",
          decimals: 18,
        },
      },
      display: {
        formats: {
          "submit(address)": {
            intent: "Stake ETH to receive stETH",
            fields: [
              {
                label: "Amount",
                path: "@.value",
                format: "amount",
              },
              {
                label: "Referral",
                path: "#._referral",
                format: "addressName",
              },
            ],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);
    const interpret = createERC7730Interpreter(index, 1);

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

    const result = interpret(
      dataDecoded,
      "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      0,
      "1000000000000000000", // 1 ETH
      "0x1111111111111111111111111111111111111111"
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe("erc7730");
    if (!result || result.id !== "erc7730") {
      throw new Error("Expected an ERC-7730 interpretation");
    }
    expect(result.protocol).toBe("Lido");
    expect(result.action).toBe("Stake ETH to receive stETH");
    expect(result.details.fields).toHaveLength(2);
    expect(result.details.fields[0].label).toBe("Amount");
    expect(result.details.fields[0].value).toContain("ETH");
    expect(result.details.fields[1].label).toBe("Referral");
  });

  it("returns null for unknown contract", () => {
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" }],
        },
      },
      metadata: {
        owner: "Lido",
      },
      display: {
        formats: {
          "submit(address)": {
            intent: "Stake ETH",
            fields: [],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);
    const interpret = createERC7730Interpreter(index, 1);

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

    // Different contract address
    const result = interpret(
      dataDecoded,
      "0x9999999999999999999999999999999999999999",
      0
    );

    expect(result).toBeNull();
  });

  it("returns null for unknown method", () => {
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" }],
        },
      },
      metadata: {
        owner: "Lido",
      },
      display: {
        formats: {
          "submit(address)": {
            intent: "Stake ETH",
            fields: [],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);
    const interpret = createERC7730Interpreter(index, 1);

    const dataDecoded = {
      method: "unknownMethod",
      parameters: [],
    };

    const result = interpret(
      dataDecoded,
      "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      0
    );

    expect(result).toBeNull();
  });

  it("skips fields with missing values", () => {
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0x1234567890123456789012345678901234567890" }],
        },
      },
      metadata: {
        owner: "TestProtocol",
      },
      display: {
        formats: {
          "testMethod()": {
            intent: "Test action",
            fields: [
              {
                label: "Missing Field",
                path: "#.nonExistent",
                format: "raw",
              },
              {
                label: "Present Field",
                path: "#.value",
                format: "raw",
              },
            ],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);
    const interpret = createERC7730Interpreter(index, 1);

    const dataDecoded = {
      method: "testMethod",
      parameters: [
        {
          name: "value",
          type: "uint256",
          value: "123",
        },
      ],
    };

    const result = interpret(
      dataDecoded,
      "0x1234567890123456789012345678901234567890",
      0
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe("erc7730");
    if (!result || result.id !== "erc7730") {
      throw new Error("Expected an ERC-7730 interpretation");
    }
    expect(result.details.fields).toHaveLength(1);
    expect(result.details.fields[0].label).toBe("Present Field");
  });
});
