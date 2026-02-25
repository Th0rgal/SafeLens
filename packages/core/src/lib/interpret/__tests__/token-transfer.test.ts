import { describe, it, expect } from "vitest";
import { interpretTokenTransfer } from "../token-transfer";
import { interpretTransaction } from "../index";
import type { TokenTransferDetails } from "../types";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const UNKNOWN_TOKEN = "0x1234567890abcdef1234567890abcdef12345678";
const RECIPIENT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SPENDER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const SENDER = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";

const MAX_UINT256 =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

describe("interpretTokenTransfer", () => {
  describe("ERC-20 transfer", () => {
    const transferData = {
      method: "transfer",
      parameters: [
        { name: "to", type: "address", value: RECIPIENT },
        { name: "value", type: "uint256", value: "1000000" },
      ],
    };

    it("detects a transfer call", () => {
      const result = interpretTokenTransfer(transferData, USDC, 0);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("token-transfer");
      expect(result!.protocol).toBe("ERC-20");
      expect(result!.action).toBe("Transfer");
    });

    it("resolves known token symbols and decimals", () => {
      const result = interpretTokenTransfer(transferData, USDC, 0);
      const details = result!.details as TokenTransferDetails;
      expect(details.token.symbol).toBe("USDC");
      expect(details.token.decimals).toBe(6);
      expect(details.amountFormatted).toBe("1 USDC");
    });

    it("produces a human-readable summary", () => {
      const result = interpretTokenTransfer(transferData, USDC, 0);
      expect(result!.summary).toContain("Transfer");
      expect(result!.summary).toContain("USDC");
      expect(result!.summary).toContain(RECIPIENT.slice(0, 10));
    });

    it("includes recipient in details", () => {
      const result = interpretTokenTransfer(transferData, USDC, 0);
      const details = result!.details as TokenTransferDetails;
      expect(details.to).toBe(RECIPIENT);
      expect(details.actionType).toBe("transfer");
    });

    it("sets severity to info", () => {
      const result = interpretTokenTransfer(transferData, USDC, 0);
      expect(result!.severity).toBe("info");
    });

    it("handles unknown tokens with address fallback", () => {
      const result = interpretTokenTransfer(transferData, UNKNOWN_TOKEN, 0);
      const details = result!.details as TokenTransferDetails;
      expect(details.token.symbol).toBeUndefined();
      expect(details.token.address).toBe(UNKNOWN_TOKEN);
    });

    it("handles alternative parameter names (dst, wad)", () => {
      const altData = {
        method: "transfer",
        parameters: [
          { name: "dst", type: "address", value: RECIPIENT },
          { name: "wad", type: "uint256", value: "1000000000000000000" },
        ],
      };
      const result = interpretTokenTransfer(altData, WETH, 0);
      const details = result!.details as TokenTransferDetails;
      expect(details.to).toBe(RECIPIENT);
      expect(details.token.symbol).toBe("WETH");
    });
  });

  describe("ERC-20 approve", () => {
    const approveData = {
      method: "approve",
      parameters: [
        { name: "spender", type: "address", value: SPENDER },
        { name: "value", type: "uint256", value: "5000000000" },
      ],
    };

    it("detects an approve call", () => {
      const result = interpretTokenTransfer(approveData, USDC, 0);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("Approve");
    });

    it("includes spender in details", () => {
      const result = interpretTokenTransfer(approveData, USDC, 0);
      const details = result!.details as TokenTransferDetails;
      expect(details.spender).toBe(SPENDER);
      expect(details.actionType).toBe("approve");
    });

    it("sets severity to info for bounded approvals", () => {
      const result = interpretTokenTransfer(approveData, USDC, 0);
      expect(result!.severity).toBe("info");
      const details = result!.details as TokenTransferDetails;
      expect(details.isUnlimitedApproval).toBeFalsy();
    });

    it("detects unlimited approvals and sets severity to warning", () => {
      const unlimitedApprove = {
        method: "approve",
        parameters: [
          { name: "spender", type: "address", value: SPENDER },
          { name: "value", type: "uint256", value: MAX_UINT256 },
        ],
      };
      const result = interpretTokenTransfer(unlimitedApprove, USDC, 0);
      expect(result!.severity).toBe("warning");
      const details = result!.details as TokenTransferDetails;
      expect(details.isUnlimitedApproval).toBe(true);
      expect(details.amountFormatted).toContain("unlimited");
    });

    it("handles the 'guy' parameter name (WETH style)", () => {
      const wethApprove = {
        method: "approve",
        parameters: [
          { name: "guy", type: "address", value: SPENDER },
          { name: "wad", type: "uint256", value: "1000000000000000000" },
        ],
      };
      const result = interpretTokenTransfer(wethApprove, WETH, 0);
      const details = result!.details as TokenTransferDetails;
      expect(details.spender).toBe(SPENDER);
    });
  });

  describe("ERC-20 transferFrom", () => {
    const transferFromData = {
      method: "transferFrom",
      parameters: [
        { name: "from", type: "address", value: SENDER },
        { name: "to", type: "address", value: RECIPIENT },
        { name: "value", type: "uint256", value: "2000000" },
      ],
    };

    it("detects a transferFrom call", () => {
      const result = interpretTokenTransfer(transferFromData, USDC, 0);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("TransferFrom");
    });

    it("includes from and to in details", () => {
      const result = interpretTokenTransfer(transferFromData, USDC, 0);
      const details = result!.details as TokenTransferDetails;
      expect(details.from).toBe(SENDER);
      expect(details.to).toBe(RECIPIENT);
      expect(details.actionType).toBe("transferFrom");
    });

    it("produces a summary with both addresses", () => {
      const result = interpretTokenTransfer(transferFromData, USDC, 0);
      expect(result!.summary).toContain("TransferFrom");
      expect(result!.summary).toContain(SENDER.slice(0, 10));
      expect(result!.summary).toContain(RECIPIENT.slice(0, 10));
    });
  });

  describe("native transfer", () => {
    it("detects a native ETH transfer (empty calldata + non-zero value)", () => {
      const result = interpretTokenTransfer(
        null, RECIPIENT, 0,
        "0x", 1, "1000000000000000000",
      );
      expect(result).not.toBeNull();
      expect(result!.id).toBe("token-transfer");
      expect(result!.protocol).toBe("Native");
      expect(result!.action).toBe("Transfer");
    });

    it("uses the chain's native token symbol", () => {
      const chains = { "100": { nativeTokenSymbol: "xDAI" } };
      const result = interpretTokenTransfer(
        null, RECIPIENT, 0,
        "0x", 100, "5000000000000000000",
        undefined, chains,
      );
      const details = result!.details as TokenTransferDetails;
      expect(details.token.symbol).toBe("xDAI");
      expect(details.amountFormatted).toContain("xDAI");
      expect(details.isNative).toBe(true);
    });

    it("defaults to ETH when no chain config is provided", () => {
      const result = interpretTokenTransfer(
        null, RECIPIENT, 0,
        "0x", undefined, "2000000000000000000",
      );
      const details = result!.details as TokenTransferDetails;
      expect(details.token.symbol).toBe("ETH");
      expect(details.amountFormatted).toContain("ETH");
    });

    it("formats the amount with 18 decimals", () => {
      const result = interpretTokenTransfer(
        null, RECIPIENT, 0,
        "0x", 1, "1500000000000000000",
      );
      const details = result!.details as TokenTransferDetails;
      expect(details.amountFormatted).toBe("1.5 ETH");
    });

    it("sets recipient to txTo", () => {
      const result = interpretTokenTransfer(
        null, RECIPIENT, 0,
        "0x", 1, "1000000000000000000",
      );
      const details = result!.details as TokenTransferDetails;
      expect(details.to).toBe(RECIPIENT);
      expect(details.actionType).toBe("nativeTransfer");
    });

    it("uses zero address as token address", () => {
      const result = interpretTokenTransfer(
        null, RECIPIENT, 0,
        "0x", 1, "1000000000000000000",
      );
      const details = result!.details as TokenTransferDetails;
      expect(details.token.address).toBe("0x0000000000000000000000000000000000000000");
    });

    it("returns null for zero value with empty calldata", () => {
      const result = interpretTokenTransfer(
        null, RECIPIENT, 0,
        "0x", 1, "0",
      );
      expect(result).toBeNull();
    });

    it("returns null for delegatecall with value", () => {
      const result = interpretTokenTransfer(
        null, RECIPIENT, 1,
        "0x", 1, "1000000000000000000",
      );
      expect(result).toBeNull();
    });

    it("treats null txData as empty calldata", () => {
      const result = interpretTokenTransfer(
        null, RECIPIENT, 0,
        null, 1, "1000000000000000000",
      );
      expect(result).not.toBeNull();
      expect(result!.protocol).toBe("Native");
    });
  });

  describe("edge cases", () => {
    it("returns null for delegatecall operations", () => {
      const data = {
        method: "transfer",
        parameters: [
          { name: "to", type: "address", value: RECIPIENT },
          { name: "value", type: "uint256", value: "1000" },
        ],
      };
      const result = interpretTokenTransfer(data, USDC, 1);
      expect(result).toBeNull();
    });

    it("returns null for unknown methods", () => {
      const data = {
        method: "mint",
        parameters: [
          { name: "to", type: "address", value: RECIPIENT },
          { name: "amount", type: "uint256", value: "1000" },
        ],
      };
      const result = interpretTokenTransfer(data, USDC, 0);
      expect(result).toBeNull();
    });

    it("returns null for null dataDecoded without value", () => {
      const result = interpretTokenTransfer(null, USDC, 0);
      expect(result).toBeNull();
    });

    it("returns null when required parameters are missing", () => {
      const incomplete = {
        method: "transfer",
        parameters: [
          { name: "to", type: "address", value: RECIPIENT },
          // missing value
        ],
      };
      const result = interpretTokenTransfer(incomplete, USDC, 0);
      expect(result).toBeNull();
    });
  });
});

describe("interpretTransaction routes token transfers", () => {
  it("routes ERC-20 transfer to the token transfer interpreter", () => {
    const data = {
      method: "transfer",
      parameters: [
        { name: "to", type: "address", value: RECIPIENT },
        { name: "value", type: "uint256", value: "1000000" },
      ],
    };
    const result = interpretTransaction(data, USDC, 0);
    expect(result).not.toBeNull();
    expect(result!.protocol).toBe("ERC-20");
  });

  it("routes native transfer to the token transfer interpreter", () => {
    const result = interpretTransaction(
      null, RECIPIENT, 0,
      undefined, "0x", 1, "1000000000000000000",
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe("token-transfer");
    expect(result!.protocol).toBe("Native");
  });

  it("respects disabledIds for token transfer interpreter", () => {
    const data = {
      method: "transfer",
      parameters: [
        { name: "to", type: "address", value: RECIPIENT },
        { name: "value", type: "uint256", value: "1000000" },
      ],
    };
    const result = interpretTransaction(
      data,
      USDC,
      0,
      ["token-transfer"],
    );
    // Should fall through to ERC-7730 or return null
    expect(result?.id).not.toBe("token-transfer");
  });
});
