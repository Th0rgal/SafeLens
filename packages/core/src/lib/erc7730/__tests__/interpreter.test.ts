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
      undefined,
      1,
      "1000000000000000000",
      "0x1111111111111111111111111111111111111111",
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
    expect(result.details.fields[0].value).toContain("1");
    expect(result.details.fields[1].label).toBe("Referral");
  });

  it("uses chain native token symbol from settings when formatting amount", () => {
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 100, address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" }],
        },
      },
      metadata: {
        owner: "Lido",
      },
      display: {
        formats: {
          "submit(address)": {
            intent: "Stake",
            fields: [
              {
                label: "Amount",
                path: "@.value",
                format: "amount",
              },
            ],
          },
        },
      },
    };

    const interpret = createERC7730Interpreter(buildIndex([descriptor]));
    const result = interpret(
      { method: "submit", parameters: [{ name: "_referral", type: "address", value: "0x0000000000000000000000000000000000000000" }] },
      "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      0,
      undefined,
      100,
      "1000000000000000000",
      undefined,
      { "100": { nativeTokenSymbol: "DAI" } },
    );

    expect(result).not.toBeNull();
    if (!result || result.id !== "erc7730") {
      throw new Error("Expected an ERC-7730 interpretation");
    }
    expect(result.details.fields[0].value).toBe("1 DAI");
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

  it("decodes raw calldata fields using the ERC-7730 signature (no chainId)", () => {
    const sig = "create((uint256 salt, uint256 maker, uint256 receiver, uint256 makerAsset, uint256 takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 makerTraits) makerOrder)";
    const takerAssetAddr = BigInt("0x6B175474E89094C44Da98b954EedeAC495271d0F"); // DAI
    const receiverAddr = BigInt("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");

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
                format: "tokenAmount",
                params: {
                  tokenPath: "makerOrder.takerAsset",
                },
              },
              {
                label: "Beneficiary",
                path: "makerOrder.receiver",
                format: "addressName",
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
        receiver: receiverAddr,
        makerAsset: 0x5555n,
        takerAsset: takerAssetAddr,
        makingAmount: 1000n,
        takingAmount: 500000000000000000n, // 0.5 in 18-decimal units
        makerTraits: 0n,
      }],
    });

    const index = buildIndex([descriptor]);
    const interpret = createERC7730Interpreter(index);

    // No chainId, fallback shows raw value + token address
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

    // tokenAmount without chainId: shows raw value + token address
    expect(result.details.fields[0].label).toBe("Minimum to receive");
    expect(result.details.fields[0].value).toContain("500000000000000000");
    expect(result.details.fields[0].value).toContain("0x6b175474e89094c44da98b954eedeac495271d0f");

    // addressName: uint256 is converted to hex address
    expect(result.details.fields[1].label).toBe("Beneficiary");
    expect(result.details.fields[1].value).toBe("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
  });

  it("resolves token name and decimals when chainId is provided", () => {
    const sig = "create((uint256 salt, uint256 maker, uint256 receiver, uint256 makerAsset, uint256 takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 makerTraits) makerOrder)";
    // USDT on Ethereum (0xdAC17F958D2ee523a2206206994597C13D831ec7, 6 decimals)
    const takerAssetAddr = BigInt("0xdAC17F958D2ee523a2206206994597C13D831ec7");
    const receiverAddr = BigInt("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");

    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01" }],
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
                format: "tokenAmount",
                params: {
                  tokenPath: "makerOrder.takerAsset",
                },
              },
            ],
          },
        },
      },
    };

    const abiItem = parseAbiItem(`function ${sig}`);
    const txData = encodeFunctionData({
      abi: [abiItem],
      functionName: "create",
      args: [{
        salt: 1n,
        maker: 0x1234n,
        receiver: receiverAddr,
        makerAsset: 0x5555n,
        takerAsset: takerAssetAddr,
        makingAmount: 1000n,
        takingAmount: 998945n, // 0.998945 USDC (6 decimals)
        makerTraits: 0n,
      }],
    });

    const index = buildIndex([descriptor]);
    const interpret = createERC7730Interpreter(index);

    // With chainId=1 (Ethereum), USDT should be resolved from token list
    const result = interpret(
      null,
      "0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01",
      0,
      txData,
      1,
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe("erc7730");
    if (!result || result.id !== "erc7730") {
      throw new Error("Expected an ERC-7730 interpretation");
    }
    expect(result.details.fields).toHaveLength(1);
    expect(result.details.fields[0].label).toBe("Minimum to receive");
    expect(result.details.fields[0].value).toBe("0.998945 USDT");
  });

  it("resolves token metadata from params.token metadata constants", () => {
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 100, address: "0x1111111111111111111111111111111111111111" }],
        },
      },
      metadata: {
        owner: "Example Protocol",
        constants: {
          underlyingToken: "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83",
        },
      },
      display: {
        formats: {
          "deposit(uint256 assets)": {
            intent: "Deposit",
            fields: [
              {
                path: "assets",
                label: "Amount",
                format: "tokenAmount",
                params: {
                  token: "$.metadata.constants.underlyingToken",
                },
              },
            ],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);
    const interpret = createERC7730Interpreter(index);
    const abiItem = parseAbiItem("function deposit(uint256 assets)");
    const txData = encodeFunctionData({
      abi: [abiItem],
      functionName: "deposit",
      args: [998945n],
    });

    const result = interpret(
      null,
      "0x1111111111111111111111111111111111111111",
      0,
      txData,
      100,
    );

    expect(result).not.toBeNull();
    if (!result || result.id !== "erc7730") {
      throw new Error("Expected an ERC-7730 interpretation");
    }
    expect(result.details.fields[0].value).toBe("0.998945 USDC");
  });

  it("resolves bare single-segment field paths like _value and _to", () => {
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" }],
        },
      },
      metadata: {
        owner: "Tether",
        token: { name: "Tether USD", ticker: "USDT", decimals: 6 },
      },
      display: {
        formats: {
          "transfer(address,uint256)": {
            intent: "Send",
            fields: [
              { path: "_value", label: "Amount", format: "tokenAmount" },
              { path: "_to", label: "To", format: "addressName" },
            ],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);
    const interpret = createERC7730Interpreter(index);

    const dataDecoded = {
      method: "transfer",
      parameters: [
        { name: "_to", type: "address", value: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
        { name: "_value", type: "uint256", value: "1000000" },
      ],
    };

    const result = interpret(
      dataDecoded,
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      0,
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe("erc7730");
    if (!result || result.id !== "erc7730") throw new Error("Expected ERC-7730");
    expect(result.details.fields).toHaveLength(2);
    expect(result.details.fields[0].label).toBe("Amount");
    expect(result.details.fields[0].value).toBe("1 USDT");
    expect(result.details.fields[1].label).toBe("To");
    expect(result.details.fields[1].value).toBe("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  });

  it("matches descriptors with selector-only format keys when dataDecoded is available", () => {
    // Simulates Uniswap V3 Router where format key is "0x04e45aaf" instead of a function signature
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" }],
        },
      },
      metadata: { owner: "Uniswap" },
      display: {
        formats: {
          "0x04e45aaf": {
            intent: "swap",
            fields: [
              { path: "params.amountIn", label: "Send", format: "raw" },
            ],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);
    const interpret = createERC7730Interpreter(index);

    // dataDecoded is available (from Safe tx service) with method name
    const dataDecoded = {
      method: "exactInputSingle",
      parameters: [
        {
          name: "params",
          type: "tuple",
          value: {
            amountIn: "1000000000000000000",
            amountOutMinimum: "500000",
            tokenIn: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            fee: "3000",
            recipient: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
            sqrtPriceLimitX96: "0",
          },
        },
      ],
    };

    // txData starts with 0x04e45aaf selector
    const txData = "0x04e45aaf" + "0".repeat(512);

    const result = interpret(
      dataDecoded,
      "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
      0,
      txData,
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe("erc7730");
    if (!result || result.id !== "erc7730") throw new Error("Expected ERC-7730");
    expect(result.protocol).toBe("Uniswap");
    expect(result.action).toBe("swap");
    expect(result.details.fields).toHaveLength(1);
    expect(result.details.fields[0].label).toBe("Send");
    expect(result.details.fields[0].value).toBe("1000000000000000000");
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
