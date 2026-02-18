import { describe, it, expect } from "vitest";
import { encodeFunctionData, parseAbiItem } from "viem";
import { createERC7730Interpreter } from "../interpreter";
import { buildIndex, computeSelector } from "../index";
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
    const interpret = createERC7730Interpreter(index);

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
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe("erc7730");
    if (!result || result.id !== "erc7730") {
      throw new Error("Expected an ERC-7730 interpretation");
    }
    expect(result.protocol).toBe("Lido");
    expect(result.action).toBe("Stake ETH to receive stETH");
    // Only the Referral field is present (Amount uses @.value which isn't passed through the pipeline)
    expect(result.details.fields).toHaveLength(1);
    expect(result.details.fields[0].label).toBe("Referral");
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
    const interpret = createERC7730Interpreter(index);

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
    const interpret = createERC7730Interpreter(index);

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
    const interpret = createERC7730Interpreter(index);

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

  it("falls back to raw calldata selector when dataDecoded is null", () => {
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 100, address: "0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01" }],
        },
      },
      metadata: {
        owner: "1inch",
      },
      display: {
        formats: {
          "create((uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))": {
            intent: "Create Limit Order",
            fields: [],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);
    const interpret = createERC7730Interpreter(index);

    // selector for create((uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))
    const selector = computeSelector("create((uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))");
    const txData = selector + "0".repeat(512); // selector + dummy calldata

    // dataDecoded is null, but txData provides the selector
    const result = interpret(
      null,
      "0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01",
      0,
      txData
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe("erc7730");
    if (!result || result.id !== "erc7730") {
      throw new Error("Expected an ERC-7730 interpretation");
    }
    expect(result.protocol).toBe("1inch");
    expect(result.action).toBe("Create Limit Order");
    expect(result.details.fields).toHaveLength(0); // no decoded params
  });

  it("decodes raw calldata fields using the ERC-7730 signature", () => {
    const sig = "create((uint256 salt, uint256 maker, uint256 receiver, uint256 makerAsset, uint256 takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 makerTraits) makerOrder)";

    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 100, address: "0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01" }],
        },
      },
      metadata: {
        owner: "1inch",
      },
      display: {
        formats: {
          [sig]: {
            intent: "create order",
            fields: [
              {
                label: "Minimum to receive",
                path: "makerOrder.takingAmount",
                format: "raw",
              },
              {
                label: "Beneficiary",
                path: "makerOrder.receiver",
                format: "raw",
              },
            ],
          },
        },
      },
    };

    // Encode real calldata
    const abiItem = parseAbiItem(`function ${sig}`);
    const txData = encodeFunctionData({
      abi: [abiItem],
      functionName: "create",
      args: [{
        salt: 1n,
        maker: 0x1234n,
        receiver: 0xABCDn,
        makerAsset: 0x5555n,
        takerAsset: 0x6666n,
        makingAmount: 1000n,
        takingAmount: 500n,
        makerTraits: 0n,
      }],
    });

    const index = buildIndex([descriptor]);
    const interpret = createERC7730Interpreter(index);

    const result = interpret(
      null,
      "0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01",
      0,
      txData,
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe("erc7730");
    if (!result || result.id !== "erc7730") {
      throw new Error("Expected an ERC-7730 interpretation");
    }
    expect(result.protocol).toBe("1inch");
    expect(result.action).toBe("create order");
    expect(result.details.fields).toHaveLength(2);
    expect(result.details.fields[0].label).toBe("Minimum to receive");
    expect(result.details.fields[0].value).toBe("500");
    expect(result.details.fields[1].label).toBe("Beneficiary");
    expect(result.details.fields[1].value).toBe("43981"); // 0xABCD = 43981
  });

  it("returns null for raw calldata with unknown selector", () => {
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
            fields: [],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);
    const interpret = createERC7730Interpreter(index);

    const result = interpret(
      null,
      "0x1234567890123456789012345678901234567890",
      0,
      "0xdeadbeef" // unknown selector
    );

    expect(result).toBeNull();
  });
});
