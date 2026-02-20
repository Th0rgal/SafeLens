import { describe, expect, it } from "vitest";
import { summarizeSimulationEvents } from "../summary";
import type { SimulationLog } from "../../types";

const SAFE = "0x1234567890abcdef1234567890abcdef12345678";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

function pad32(addr: string): string {
  return "0x" + addr.replace("0x", "").padStart(64, "0");
}

function uint256Hex(n: bigint): string {
  return "0x" + n.toString(16).padStart(64, "0");
}

describe("summarizeSimulationEvents", () => {
  it("summarizes transfer/approval counts and previews", () => {
    const logs: SimulationLog[] = [
      {
        address: "0x6b175474e89094c44da98b954eedeac495271d0f",
        topics: [TRANSFER_TOPIC, pad32(SAFE), pad32("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")],
        data: uint256Hex(250n * 10n ** 18n),
      },
      {
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        topics: [TRANSFER_TOPIC, pad32("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), pad32(SAFE)],
        data: uint256Hex(12n * 10n ** 6n),
      },
      {
        address: "0x6b175474e89094c44da98b954eedeac495271d0f",
        topics: [APPROVAL_TOPIC, pad32(SAFE), pad32("0xcccccccccccccccccccccccccccccccccccccccc")],
        data: uint256Hex((1n << 256n) - 1n),
      },
    ];

    const summary = summarizeSimulationEvents(logs, SAFE, 1, { maxTransferPreviews: 5 });

    expect(summary.totalEvents).toBe(3);
    expect(summary.transfersOut).toBe(1);
    expect(summary.transfersIn).toBe(1);
    expect(summary.approvals).toBe(1);
    expect(summary.unlimitedApprovals).toBe(1);
    expect(summary.transferPreviews).toHaveLength(2);
    expect(summary.transferPreviews[0]).toMatchObject({
      direction: "send",
      counterpartyRole: "to",
      tokenSymbol: "DAI",
    });
    expect(summary.transferPreviews[1]).toMatchObject({
      direction: "receive",
      counterpartyRole: "from",
      tokenSymbol: "USDC",
    });
  });

  it("respects maxTransferPreviews", () => {
    const logs: SimulationLog[] = [
      {
        address: "0x6b175474e89094c44da98b954eedeac495271d0f",
        topics: [TRANSFER_TOPIC, pad32(SAFE), pad32("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")],
        data: uint256Hex(1n),
      },
      {
        address: "0x6b175474e89094c44da98b954eedeac495271d0f",
        topics: [TRANSFER_TOPIC, pad32(SAFE), pad32("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")],
        data: uint256Hex(2n),
      },
    ];

    const summary = summarizeSimulationEvents(logs, SAFE, 1, { maxTransferPreviews: 1 });
    expect(summary.transferPreviews).toHaveLength(1);
    expect(summary.transfersOut).toBe(2);
  });
});
