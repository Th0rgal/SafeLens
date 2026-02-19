import { describe, it, expect } from "vitest";
import { decodeSimulationEvents } from "../event-decoder";
import type { SimulationLog } from "../../types";

const SAFE = "0x1234567890abcdef1234567890abcdef12345678";

// ── Known event signature topic hashes ──────────────────────────────

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const DEPOSIT_TOPIC =
  "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";
const WITHDRAWAL_TOPIC =
  "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";

// ── Helpers ─────────────────────────────────────────────────────────

function pad32(addr: string): string {
  return "0x" + addr.replace("0x", "").padStart(64, "0");
}

function uint256Hex(n: bigint): string {
  return "0x" + n.toString(16).padStart(64, "0");
}

// ── Tests ───────────────────────────────────────────────────────────

describe("decodeSimulationEvents", () => {
  it("returns empty array for empty logs", () => {
    expect(decodeSimulationEvents([], SAFE)).toEqual([]);
  });

  it("skips logs with no topics", () => {
    const logs: SimulationLog[] = [
      { address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", topics: [], data: "0x" },
    ];
    expect(decodeSimulationEvents(logs, SAFE)).toEqual([]);
  });

  describe("ERC-20 Transfer", () => {
    it("decodes a known-token transfer (WETH)", () => {
      const amount = 5000n * 10n ** 18n;
      const logs: SimulationLog[] = [
        {
          address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          topics: [TRANSFER_TOPIC, pad32(SAFE), pad32("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")],
          data: uint256Hex(amount),
        },
      ];

      const events = decodeSimulationEvents(logs, SAFE, 1);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("transfer");
      expect(events[0].tokenSymbol).toBe("WETH");
      expect(events[0].tokenDecimals).toBe(18);
      expect(events[0].direction).toBe("send");
      expect(events[0].amountFormatted).toContain("5,000");
      expect(events[0].amountFormatted).toContain("WETH");
    });

    it("decodes a receive direction", () => {
      const amount = 1000000n; // 1 USDC
      const logs: SimulationLog[] = [
        {
          address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          topics: [TRANSFER_TOPIC, pad32("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), pad32(SAFE)],
          data: uint256Hex(amount),
        },
      ];

      const events = decodeSimulationEvents(logs, SAFE, 1);
      expect(events).toHaveLength(1);
      expect(events[0].direction).toBe("receive");
      expect(events[0].tokenSymbol).toBe("USDC");
      expect(events[0].amountFormatted).toContain("1");
      expect(events[0].amountFormatted).toContain("USDC");
    });

    it("handles unknown tokens with raw amount", () => {
      const logs: SimulationLog[] = [
        {
          address: "0x0000000000000000000000000000000000000042",
          topics: [TRANSFER_TOPIC, pad32(SAFE), pad32("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")],
          data: uint256Hex(12345n),
        },
      ];

      const events = decodeSimulationEvents(logs, SAFE, 1);
      expect(events).toHaveLength(1);
      expect(events[0].tokenSymbol).toBeNull();
      expect(events[0].amountRaw).toBe("12345");
    });
  });

  describe("ERC-721 Transfer", () => {
    it("decodes an NFT transfer (4 topics)", () => {
      const tokenId = 42n;
      const logs: SimulationLog[] = [
        {
          address: "0x0000000000000000000000000000000000000099",
          topics: [
            TRANSFER_TOPIC,
            pad32("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
            pad32(SAFE),
            pad32("0x" + tokenId.toString(16)),
          ],
          data: "0x",
        },
      ];

      const events = decodeSimulationEvents(logs, SAFE, 1);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("nft-transfer");
      expect(events[0].tokenId).toBe("42");
      expect(events[0].direction).toBe("receive");
      expect(events[0].amountFormatted).toContain("#42");
    });
  });

  describe("ERC-20 Approval", () => {
    it("decodes a normal approval", () => {
      const amount = 100n * 10n ** 18n;
      const logs: SimulationLog[] = [
        {
          address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          topics: [APPROVAL_TOPIC, pad32(SAFE), pad32("0xcccccccccccccccccccccccccccccccccccccccc")],
          data: uint256Hex(amount),
        },
      ];

      const events = decodeSimulationEvents(logs, SAFE, 1);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("approval");
      expect(events[0].tokenSymbol).toBe("WETH");
      expect(events[0].amountFormatted).toContain("100");
    });

    it("detects unlimited approval", () => {
      const maxUint = (1n << 256n) - 1n;
      const logs: SimulationLog[] = [
        {
          address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          topics: [APPROVAL_TOPIC, pad32(SAFE), pad32("0xcccccccccccccccccccccccccccccccccccccccc")],
          data: uint256Hex(maxUint),
        },
      ];

      const events = decodeSimulationEvents(logs, SAFE, 1);
      expect(events).toHaveLength(1);
      expect(events[0].amountFormatted).toContain("Unlimited");
    });
  });

  describe("WETH Deposit/Withdrawal", () => {
    it("decodes a WETH deposit (wrap)", () => {
      const amount = 2n * 10n ** 18n;
      const logs: SimulationLog[] = [
        {
          address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          topics: [DEPOSIT_TOPIC, pad32(SAFE)],
          data: uint256Hex(amount),
        },
      ];

      const events = decodeSimulationEvents(logs, SAFE, 1);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("wrap");
      expect(events[0].amountFormatted).toContain("2");
      expect(events[0].amountFormatted).toContain("WETH");
    });

    it("decodes a WETH withdrawal (unwrap)", () => {
      const amount = 3n * 10n ** 18n;
      const logs: SimulationLog[] = [
        {
          address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          topics: [WITHDRAWAL_TOPIC, pad32(SAFE)],
          data: uint256Hex(amount),
        },
      ];

      const events = decodeSimulationEvents(logs, SAFE, 1);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("unwrap");
      expect(events[0].amountFormatted).toContain("3");
    });
  });

  describe("multiple events", () => {
    it("decodes a swap pattern (send token A, receive token B)", () => {
      const sendAmount = 5000n * 10n ** 18n;
      const receiveAmount = 12000000n * 10n ** 6n;

      const logs: SimulationLog[] = [
        {
          address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          topics: [TRANSFER_TOPIC, pad32(SAFE), pad32("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")],
          data: uint256Hex(sendAmount),
        },
        {
          address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          topics: [TRANSFER_TOPIC, pad32("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), pad32(SAFE)],
          data: uint256Hex(receiveAmount),
        },
      ];

      const events = decodeSimulationEvents(logs, SAFE, 1);
      expect(events).toHaveLength(2);
      expect(events[0].direction).toBe("send");
      expect(events[0].tokenSymbol).toBe("WETH");
      expect(events[1].direction).toBe("receive");
      expect(events[1].tokenSymbol).toBe("USDC");
    });
  });
});
