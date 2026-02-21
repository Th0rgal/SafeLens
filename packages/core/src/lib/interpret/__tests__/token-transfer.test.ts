import { describe, it, expect } from "vitest";
import { interpretERC20Transfer } from "../token-transfer";
import { interpretTransaction } from "../index";
import type { ERC20TransferDetails } from "../types";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const UNKNOWN_TOKEN = "0x1234567890abcdef1234567890abcdef12345678";
const RECIPIENT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SPENDER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const SENDER = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";

const MAX_UINT256 =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

describe("interpretERC20Transfer", () => {
  describe("transfer", () => {
    const transferData = {
      method: "transfer",
      parameters: [
        { name: "to", type: "address", value: RECIPIENT },
        { name: "value", type: "uint256", value: "1000000" },
      ],
    };

    it("detects a transfer call", () => {
      const result = interpretERC20Transfer(transferData, USDC, 0);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("erc20-transfer");
      expect(result!.protocol).toBe("ERC-20");
      expect(result!.action).toBe("Transfer");
    });

    it("resolves known token symbols and decimals", () => {
      const result = interpretERC20Transfer(transferData, USDC, 0);
      const details = result!.details as ERC20TransferDetails;
      expect(details.token.symbol).toBe("USDC");
      expect(details.token.decimals).toBe(6);
      expect(details.amountFormatted).toBe("1.0000 USDC");
    });

    it("produces a human-readable summary", () => {
      const result = interpretERC20Transfer(transferData, USDC, 0);
      expect(result!.summary).toContain("Transfer");
      expect(result!.summary).toContain("USDC");
      expect(result!.summary).toContain(RECIPIENT.slice(0, 10));
    });

    it("includes recipient in details", () => {
      const result = interpretERC20Transfer(transferData, USDC, 0);
      const details = result!.details as ERC20TransferDetails;
      expect(details.to).toBe(RECIPIENT);
      expect(details.actionType).toBe("transfer");
    });

    it("sets severity to info", () => {
      const result = interpretERC20Transfer(transferData, USDC, 0);
      expect(result!.severity).toBe("info");
    });

    it("handles unknown tokens with address fallback", () => {
      const result = interpretERC20Transfer(transferData, UNKNOWN_TOKEN, 0);
      const details = result!.details as ERC20TransferDetails;
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
      const result = interpretERC20Transfer(altData, WETH, 0);
      const details = result!.details as ERC20TransferDetails;
      expect(details.to).toBe(RECIPIENT);
      expect(details.token.symbol).toBe("WETH");
    });
  });

  describe("approve", () => {
    const approveData = {
      method: "approve",
      parameters: [
        { name: "spender", type: "address", value: SPENDER },
        { name: "value", type: "uint256", value: "5000000000" },
      ],
    };

    it("detects an approve call", () => {
      const result = interpretERC20Transfer(approveData, USDC, 0);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("Approve");
    });

    it("includes spender in details", () => {
      const result = interpretERC20Transfer(approveData, USDC, 0);
      const details = result!.details as ERC20TransferDetails;
      expect(details.spender).toBe(SPENDER);
      expect(details.actionType).toBe("approve");
    });

    it("sets severity to info for bounded approvals", () => {
      const result = interpretERC20Transfer(approveData, USDC, 0);
      expect(result!.severity).toBe("info");
      const details = result!.details as ERC20TransferDetails;
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
      const result = interpretERC20Transfer(unlimitedApprove, USDC, 0);
      expect(result!.severity).toBe("warning");
      const details = result!.details as ERC20TransferDetails;
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
      const result = interpretERC20Transfer(wethApprove, WETH, 0);
      const details = result!.details as ERC20TransferDetails;
      expect(details.spender).toBe(SPENDER);
    });
  });

  describe("transferFrom", () => {
    const transferFromData = {
      method: "transferFrom",
      parameters: [
        { name: "from", type: "address", value: SENDER },
        { name: "to", type: "address", value: RECIPIENT },
        { name: "value", type: "uint256", value: "2000000" },
      ],
    };

    it("detects a transferFrom call", () => {
      const result = interpretERC20Transfer(transferFromData, USDC, 0);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("TransferFrom");
    });

    it("includes from and to in details", () => {
      const result = interpretERC20Transfer(transferFromData, USDC, 0);
      const details = result!.details as ERC20TransferDetails;
      expect(details.from).toBe(SENDER);
      expect(details.to).toBe(RECIPIENT);
      expect(details.actionType).toBe("transferFrom");
    });

    it("produces a summary with both addresses", () => {
      const result = interpretERC20Transfer(transferFromData, USDC, 0);
      expect(result!.summary).toContain("TransferFrom");
      expect(result!.summary).toContain(SENDER.slice(0, 10));
      expect(result!.summary).toContain(RECIPIENT.slice(0, 10));
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
      const result = interpretERC20Transfer(data, USDC, 1);
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
      const result = interpretERC20Transfer(data, USDC, 0);
      expect(result).toBeNull();
    });

    it("returns null for null dataDecoded", () => {
      const result = interpretERC20Transfer(null, USDC, 0);
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
      const result = interpretERC20Transfer(incomplete, USDC, 0);
      expect(result).toBeNull();
    });
  });
});

describe("interpretTransaction routes ERC-20 transfers", () => {
  it("routes transfer to the ERC-20 interpreter", () => {
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

  it("respects disabledIds for ERC-20 interpreter", () => {
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
      ["erc20-transfer"],
    );
    // Should fall through to ERC-7730 or return null
    expect(result?.id).not.toBe("erc20-transfer");
  });
});
