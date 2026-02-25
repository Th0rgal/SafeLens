import { describe, expect, it } from "vitest";
import { summarizeSimulationEvents, computeRemainingApprovals, summarizeStateDiffs } from "../summary";
import { decodeSimulationEvents } from "../event-decoder";
import type { SimulationLog, NativeTransfer, StateDiffEntry } from "../../types";
import type { DecodedEvent } from "../event-decoder";

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

  it("includes native transfers from call trace", () => {
    const nativeTransfers: NativeTransfer[] = [
      {
        from: SAFE,
        to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        value: "1500000000000000000",
      },
    ];

    const summary = summarizeSimulationEvents([], SAFE, 1, { nativeTransfers });

    expect(summary.totalEvents).toBe(1);
    expect(summary.transfersOut).toBe(1);
    expect(summary.transferPreviews).toHaveLength(1);
    expect(summary.transferPreviews[0]).toMatchObject({
      direction: "send",
      tokenSymbol: "ETH",
      counterpartyRole: "to",
    });
    expect(summary.transferPreviews[0]!.amountFormatted).toBe("1.5 ETH");
  });

  it("uses custom native token symbol", () => {
    const nativeTransfers: NativeTransfer[] = [
      {
        from: SAFE,
        to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        value: "5000000000000000000",
      },
    ];

    const summary = summarizeSimulationEvents([], SAFE, 100, {
      nativeTransfers,
      nativeTokenSymbol: "xDAI",
    });

    expect(summary.transferPreviews[0]).toMatchObject({
      tokenSymbol: "xDAI",
    });
    expect(summary.transferPreviews[0]!.amountFormatted).toContain("xDAI");
  });

  it("does not inject events when nativeTransfers is empty", () => {
    const summary = summarizeSimulationEvents([], SAFE, 1, {
      nativeTransfers: [],
    });

    expect(summary.totalEvents).toBe(0);
    expect(summary.transferPreviews).toHaveLength(0);
  });

  it("prepends native transfers before log-based events", () => {
    const logs: SimulationLog[] = [
      {
        address: "0x6b175474e89094c44da98b954eedeac495271d0f",
        topics: [TRANSFER_TOPIC, pad32("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), pad32(SAFE)],
        data: uint256Hex(100n * 10n ** 18n),
      },
    ];

    const nativeTransfers: NativeTransfer[] = [
      {
        from: SAFE,
        to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        value: "2000000000000000000",
      },
    ];

    const summary = summarizeSimulationEvents(logs, SAFE, 1, { nativeTransfers });

    expect(summary.totalEvents).toBe(2);
    expect(summary.transfersOut).toBe(1);
    expect(summary.transfersIn).toBe(1);
    expect(summary.transferPreviews[0]).toMatchObject({
      direction: "send",
      tokenSymbol: "ETH",
    });
    expect(summary.transferPreviews[1]).toMatchObject({
      direction: "receive",
      tokenSymbol: "DAI",
    });
  });

  it("handles native ETH received back (e.g. DEX swap returning ETH)", () => {
    const nativeTransfers: NativeTransfer[] = [
      {
        from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        to: SAFE,
        value: "3000000000000000000",
      },
    ];

    const summary = summarizeSimulationEvents([], SAFE, 1, { nativeTransfers });

    expect(summary.transfersIn).toBe(1);
    expect(summary.transfersOut).toBe(0);
    expect(summary.transferPreviews[0]).toMatchObject({
      direction: "receive",
      counterpartyRole: "from",
      tokenSymbol: "ETH",
    });
  });

  it("handles multiple internal native transfers", () => {
    const nativeTransfers: NativeTransfer[] = [
      { from: SAFE, to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", value: "1000000000000000000" },
      { from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", value: "500000000000000000" },
      { from: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", to: SAFE, value: "200000000000000000" },
    ];

    const summary = summarizeSimulationEvents([], SAFE, 1, { nativeTransfers });

    expect(summary.totalEvents).toBe(3);
    expect(summary.transfersOut).toBe(1);
    expect(summary.transfersIn).toBe(1);
    // The middle transfer is "internal" (neither from nor to the Safe)
    const internalCount = summary.transferPreviews.filter(
      (p) => p.direction === "internal"
    ).length;
    expect(internalCount).toBe(1);
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

  it("includes native transfers in summary when provided", () => {
    const logs: SimulationLog[] = [
      {
        address: "0x6b175474e89094c44da98b954eedeac495271d0f",
        topics: [TRANSFER_TOPIC, pad32(SAFE), pad32("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")],
        data: uint256Hex(100n * 10n ** 18n),
      },
    ];

    const summary = summarizeSimulationEvents(logs, SAFE, 1, {
      nativeTransfers: [
        { from: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", to: SAFE, value: "1000000000000000000" },
      ],
      nativeTokenSymbol: "ETH",
    });

    expect(summary.totalEvents).toBe(2);
    expect(summary.transfersOut).toBe(1);
    expect(summary.transfersIn).toBe(1);
    expect(summary.transferPreviews).toHaveLength(2);
  });
});

describe("computeRemainingApprovals", () => {
  const SPENDER = "0xcccccccccccccccccccccccccccccccccccccccc";
  const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f";
  const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

  it("returns non-zero approvals from decoded events", () => {
    const logs: SimulationLog[] = [
      {
        address: DAI,
        topics: [APPROVAL_TOPIC, pad32(SAFE), pad32(SPENDER)],
        data: uint256Hex((1n << 256n) - 1n),
      },
    ];
    const events = decodeSimulationEvents(logs, SAFE, 1);
    const remaining = computeRemainingApprovals(events);

    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      token: DAI,
      tokenSymbol: "DAI",
      spender: SPENDER,
      isUnlimited: true,
    });
  });

  it("excludes approvals revoked to zero", () => {
    const logs: SimulationLog[] = [
      {
        address: DAI,
        topics: [APPROVAL_TOPIC, pad32(SAFE), pad32(SPENDER)],
        data: uint256Hex((1n << 256n) - 1n),
      },
      {
        address: DAI,
        topics: [APPROVAL_TOPIC, pad32(SAFE), pad32(SPENDER)],
        data: uint256Hex(0n),
      },
    ];
    const events = decodeSimulationEvents(logs, SAFE, 1);
    const remaining = computeRemainingApprovals(events);

    expect(remaining).toHaveLength(0);
  });

  it("keeps last approval per (token, spender) pair", () => {
    const logs: SimulationLog[] = [
      {
        address: DAI,
        topics: [APPROVAL_TOPIC, pad32(SAFE), pad32(SPENDER)],
        data: uint256Hex((1n << 256n) - 1n),
      },
      {
        address: DAI,
        topics: [APPROVAL_TOPIC, pad32(SAFE), pad32(SPENDER)],
        data: uint256Hex(500n * 10n ** 18n),
      },
    ];
    const events = decodeSimulationEvents(logs, SAFE, 1);
    const remaining = computeRemainingApprovals(events);

    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.isUnlimited).toBe(false);
    expect(remaining[0]!.amountFormatted).toContain("500");
  });

  it("tracks separate (token, spender) pairs independently", () => {
    const SPENDER_2 = "0xdddddddddddddddddddddddddddddddddddddd";
    const logs: SimulationLog[] = [
      {
        address: DAI,
        topics: [APPROVAL_TOPIC, pad32(SAFE), pad32(SPENDER)],
        data: uint256Hex(100n * 10n ** 18n),
      },
      {
        address: USDC,
        topics: [APPROVAL_TOPIC, pad32(SAFE), pad32(SPENDER_2)],
        data: uint256Hex((1n << 256n) - 1n),
      },
    ];
    const events = decodeSimulationEvents(logs, SAFE, 1);
    const remaining = computeRemainingApprovals(events);

    expect(remaining).toHaveLength(2);
    expect(remaining.find((a) => a.tokenSymbol === "DAI")?.isUnlimited).toBe(false);
    expect(remaining.find((a) => a.tokenSymbol === "USDC")?.isUnlimited).toBe(true);
  });

  it("returns empty array when there are no approvals", () => {
    const logs: SimulationLog[] = [
      {
        address: DAI,
        topics: [TRANSFER_TOPIC, pad32(SAFE), pad32("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")],
        data: uint256Hex(100n * 10n ** 18n),
      },
    ];
    const events = decodeSimulationEvents(logs, SAFE, 1);
    const remaining = computeRemainingApprovals(events);

    expect(remaining).toHaveLength(0);
  });
});

// ── summarizeStateDiffs ───────────────────────────────────────────

describe("summarizeStateDiffs", () => {
  const TOKEN_A = "0x6b175474e89094c44da98b954eedeac495271d0f"; // DAI
  const TOKEN_B = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"; // USDC
  const RANDOM_CONTRACT = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const SLOT_1 = "0x" + "00".repeat(31) + "01";
  const SLOT_2 = "0x" + "00".repeat(31) + "02";
  const ZERO = "0x" + "00".repeat(32);
  const ONE = "0x" + "00".repeat(31) + "01";

  function makeEvent(token: string, kind: "transfer" | "approval" = "transfer", symbol: string | null = null): DecodedEvent {
    return {
      kind,
      token: token.toLowerCase(),
      tokenSymbol: symbol,
      tokenDecimals: 18,
      amountFormatted: "1",
      amountRaw: "1",
      from: SAFE,
      to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      direction: "send",
    };
  }

  it("returns empty summary when stateDiffs is undefined", () => {
    const result = summarizeStateDiffs(undefined, []);
    expect(result.totalSlotsChanged).toBe(0);
    expect(result.contractsChanged).toBe(0);
    expect(result.contracts).toEqual([]);
    expect(result.silentContracts).toBe(0);
  });

  it("returns empty summary when stateDiffs is empty", () => {
    const result = summarizeStateDiffs([], []);
    expect(result.totalSlotsChanged).toBe(0);
    expect(result.contractsChanged).toBe(0);
  });

  it("groups diffs by contract and counts slots", () => {
    const diffs: StateDiffEntry[] = [
      { address: TOKEN_A, key: SLOT_1, before: ZERO, after: ONE },
      { address: TOKEN_A, key: SLOT_2, before: ZERO, after: ONE },
      { address: TOKEN_B, key: SLOT_1, before: ZERO, after: ONE },
    ];
    const events = [makeEvent(TOKEN_A, "transfer", "DAI"), makeEvent(TOKEN_B, "transfer", "USDC")];

    const result = summarizeStateDiffs(diffs, events);

    expect(result.totalSlotsChanged).toBe(3);
    expect(result.contractsChanged).toBe(2);
    expect(result.contracts).toHaveLength(2);
    // Sorted by slotsChanged descending
    expect(result.contracts[0]).toMatchObject({
      address: TOKEN_A,
      slotsChanged: 2,
      hasEvents: true,
    });
    expect(result.contracts[1]).toMatchObject({
      address: TOKEN_B,
      slotsChanged: 1,
      hasEvents: true,
    });
  });

  it("excludes the Safe address from the summary", () => {
    const diffs: StateDiffEntry[] = [
      { address: SAFE, key: SLOT_1, before: ZERO, after: ONE },
      { address: TOKEN_A, key: SLOT_1, before: ZERO, after: ONE },
    ];

    const result = summarizeStateDiffs(diffs, [], SAFE);

    expect(result.totalSlotsChanged).toBe(1);
    expect(result.contractsChanged).toBe(1);
    expect(result.contracts[0]!.address).toBe(TOKEN_A);
  });

  it("flags contracts with no events as silent", () => {
    const diffs: StateDiffEntry[] = [
      { address: TOKEN_A, key: SLOT_1, before: ZERO, after: ONE },
      { address: RANDOM_CONTRACT, key: SLOT_1, before: ZERO, after: ONE },
    ];
    const events = [makeEvent(TOKEN_A, "transfer", "DAI")];

    const result = summarizeStateDiffs(diffs, events, SAFE);

    expect(result.silentContracts).toBe(1);
    const silent = result.contracts.find((c) => c.address === RANDOM_CONTRACT);
    expect(silent).toBeDefined();
    expect(silent!.hasEvents).toBe(false);
    expect(silent!.tokenSymbol).toBeNull();
  });

  it("resolves token symbols from events", () => {
    const diffs: StateDiffEntry[] = [
      { address: TOKEN_A, key: SLOT_1, before: ZERO, after: ONE },
    ];
    const events = [makeEvent(TOKEN_A, "transfer", "DAI")];

    const result = summarizeStateDiffs(diffs, events);

    expect(result.contracts[0]!.tokenSymbol).toBe("DAI");
  });

  it("handles case-insensitive address matching", () => {
    const upperToken = TOKEN_A.toUpperCase().replace("0X", "0x") as `0x${string}`;
    const diffs: StateDiffEntry[] = [
      { address: upperToken, key: SLOT_1, before: ZERO, after: ONE },
    ];
    const events = [makeEvent(TOKEN_A, "transfer", "DAI")];

    const result = summarizeStateDiffs(diffs, events);

    expect(result.contracts[0]!.hasEvents).toBe(true);
    expect(result.contracts[0]!.tokenSymbol).toBe("DAI");
  });

  it("counts all contracts as silent when there are no events", () => {
    const diffs: StateDiffEntry[] = [
      { address: TOKEN_A, key: SLOT_1, before: ZERO, after: ONE },
      { address: TOKEN_B, key: SLOT_1, before: ZERO, after: ONE },
    ];

    const result = summarizeStateDiffs(diffs, []);

    expect(result.silentContracts).toBe(2);
  });

  it("sorts contracts by slotsChanged descending", () => {
    const diffs: StateDiffEntry[] = [
      { address: TOKEN_B, key: SLOT_1, before: ZERO, after: ONE },
      { address: TOKEN_A, key: SLOT_1, before: ZERO, after: ONE },
      { address: TOKEN_A, key: SLOT_2, before: ZERO, after: ONE },
      { address: RANDOM_CONTRACT, key: SLOT_1, before: ZERO, after: ONE },
      { address: RANDOM_CONTRACT, key: SLOT_2, before: ZERO, after: ONE },
      { address: RANDOM_CONTRACT, key: "0x" + "00".repeat(31) + "03", before: ZERO, after: ONE },
    ];

    const result = summarizeStateDiffs(diffs, []);

    expect(result.contracts[0]!.slotsChanged).toBe(3);
    expect(result.contracts[1]!.slotsChanged).toBe(2);
    expect(result.contracts[2]!.slotsChanged).toBe(1);
  });
});
