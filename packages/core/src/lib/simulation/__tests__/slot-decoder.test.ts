import { describe, expect, it } from "vitest";
import {
  decodeERC20StateDiffs,
  __internal,
} from "../slot-decoder";
import type { StateDiffEntry } from "../../types";
import type { DecodedEvent } from "../event-decoder";
import {
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  pad,
  type Address,
  type Hex,
} from "viem";

const SAFE = "0x1234567890abcdef1234567890abcdef12345678";
const ALICE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BOB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SPENDER = "0xcccccccccccccccccccccccccccccccccccccccc";
const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const ZERO = "0x" + "00".repeat(32);
const abiParams = parseAbiParameters("address, uint256");

function uint256Hex(n: bigint): Hex {
  return pad(`0x${n.toString(16)}` as Hex, { size: 32 });
}

/** Compute mapping slot: keccak256(abi.encode(key, slot)) */
function mappingSlot(key: Address, slot: bigint): Hex {
  return keccak256(encodeAbiParameters(abiParams, [key, slot]));
}

/** Compute nested mapping slot for allowance(owner, spender, baseSlot) */
function nestedMappingSlot(owner: Address, spender: Address, baseSlot: bigint): Hex {
  const outerSlot = mappingSlot(owner, baseSlot);
  return keccak256(encodeAbiParameters(abiParams, [spender, BigInt(outerSlot)]));
}

function makeTransferEvent(
  token: string,
  from: string,
  to: string,
  symbol: string | null = null,
  decimals: number | null = null,
): DecodedEvent {
  return {
    kind: "transfer",
    token: token.toLowerCase(),
    tokenSymbol: symbol,
    tokenDecimals: decimals,
    amountFormatted: "100",
    amountRaw: "100",
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    direction: "send",
  };
}

function makeApprovalEvent(
  token: string,
  owner: string,
  spender: string,
  amountRaw: string = "1000",
  symbol: string | null = null,
  decimals: number | null = null,
): DecodedEvent {
  return {
    kind: "approval",
    token: token.toLowerCase(),
    tokenSymbol: symbol,
    tokenDecimals: decimals,
    amountFormatted: amountRaw,
    amountRaw,
    from: owner.toLowerCase(),
    to: spender.toLowerCase(),
    direction: "send",
  };
}

// ── computeMappingSlot ────────────────────────────────────────────

describe("computeMappingSlot", () => {
  it("matches the standard Solidity mapping layout formula", () => {
    const key = ALICE as Address;
    const slot = 0n;
    const expected = keccak256(encodeAbiParameters(abiParams, [key, slot]));
    expect(__internal.computeMappingSlot(key, slot)).toBe(expected);
  });

  it("produces different slots for different base slots", () => {
    const key = ALICE as Address;
    const slot0 = __internal.computeMappingSlot(key, 0n);
    const slot1 = __internal.computeMappingSlot(key, 1n);
    expect(slot0).not.toBe(slot1);
  });
});

// ── computeNestedMappingSlot ──────────────────────────────────────

describe("computeNestedMappingSlot", () => {
  it("matches the nested mapping formula for allowances", () => {
    const owner = ALICE as Address;
    const spender = SPENDER as Address;
    const baseSlot = 1n;

    const outerSlot = keccak256(encodeAbiParameters(abiParams, [owner, baseSlot]));
    const expected = keccak256(
      encodeAbiParameters(abiParams, [spender, BigInt(outerSlot)]),
    );

    expect(__internal.computeNestedMappingSlot(owner, spender, baseSlot)).toBe(expected);
  });
});

// ── hexToUint256 ──────────────────────────────────────────────────

describe("hexToUint256", () => {
  it("converts zero", () => {
    expect(__internal.hexToUint256(ZERO)).toBe(0n);
  });

  it("converts non-zero value", () => {
    expect(__internal.hexToUint256(uint256Hex(12345n))).toBe(12345n);
  });

  it("handles empty string", () => {
    expect(__internal.hexToUint256("")).toBe(0n);
  });

  it("handles bare 0x", () => {
    expect(__internal.hexToUint256("0x")).toBe(0n);
  });
});

// ── formatDelta ──────────────────────────────────────────────────

describe("formatDelta", () => {
  it("formats positive delta with symbol", () => {
    const result = __internal.formatDelta(0n, 1000n * 10n ** 18n, 18, "DAI");
    expect(result).toBe("+1,000 DAI");
  });

  it("formats negative delta with symbol", () => {
    const result = __internal.formatDelta(500n * 10n ** 6n, 300n * 10n ** 6n, 6, "USDC");
    expect(result).toContain("-200");
    expect(result).toContain("USDC");
  });

  it("formats zero delta", () => {
    expect(__internal.formatDelta(100n, 100n, 18, "DAI")).toBe("0 DAI");
  });
});

// ── formatAllowanceAfter ─────────────────────────────────────────

describe("formatAllowanceAfter", () => {
  it("formats zero as '0'", () => {
    expect(__internal.formatAllowanceAfter(0n, 18, "DAI")).toBe("0");
  });

  it("formats MAX_UINT256 as unlimited", () => {
    const maxUint = (1n << 256n) - 1n;
    expect(__internal.formatAllowanceAfter(maxUint, 18, "DAI")).toBe("Unlimited DAI");
  });

  it("formats normal amount with decimals", () => {
    const result = __internal.formatAllowanceAfter(500n * 10n ** 6n, 6, "USDC");
    expect(result).toContain("500");
    expect(result).toContain("USDC");
  });
});

// ── decodeERC20StateDiffs ─────────────────────────────────────────

describe("decodeERC20StateDiffs", () => {
  it("returns empty results when stateDiffs is undefined", () => {
    const result = decodeERC20StateDiffs(undefined, []);
    expect(result.balanceChanges).toEqual([]);
    expect(result.allowances).toEqual([]);
  });

  it("returns empty results when stateDiffs is empty", () => {
    const result = decodeERC20StateDiffs([], []);
    expect(result.balanceChanges).toEqual([]);
    expect(result.allowances).toEqual([]);
  });

  it("returns empty results when events have no matching diffs", () => {
    const events = [makeTransferEvent(DAI, ALICE, BOB)];
    // State diff on a different slot that doesn't match any layout
    const diffs: StateDiffEntry[] = [
      {
        address: DAI,
        key: "0x" + "ff".repeat(32),
        before: ZERO,
        after: uint256Hex(100n),
      },
    ];
    const result = decodeERC20StateDiffs(diffs, events);
    expect(result.balanceChanges).toEqual([]);
  });

  it("matches Transfer event to balance diffs using OZ layout (slot 0)", () => {
    const senderSlot = mappingSlot(ALICE as Address, 0n);
    const receiverSlot = mappingSlot(BOB as Address, 0n);

    const diffs: StateDiffEntry[] = [
      {
        address: DAI,
        key: senderSlot,
        before: uint256Hex(1000n * 10n ** 18n),
        after: uint256Hex(900n * 10n ** 18n),
      },
      {
        address: DAI,
        key: receiverSlot,
        before: uint256Hex(0n),
        after: uint256Hex(100n * 10n ** 18n),
      },
    ];

    const events = [makeTransferEvent(DAI, ALICE, BOB, "DAI", 18)];
    const result = decodeERC20StateDiffs(diffs, events);

    expect(result.balanceChanges).toHaveLength(2);

    const senderChange = result.balanceChanges.find((c) => c.account === ALICE.toLowerCase());
    expect(senderChange).toBeDefined();
    expect(senderChange!.deltaFormatted).toContain("-100");
    expect(senderChange!.deltaFormatted).toContain("DAI");
    expect(senderChange!.layoutName).toBe("oz");

    const receiverChange = result.balanceChanges.find((c) => c.account === BOB.toLowerCase());
    expect(receiverChange).toBeDefined();
    expect(receiverChange!.deltaFormatted).toContain("+100");
  });

  it("matches Approval event to allowance diff using OZ layout (slot 1)", () => {
    const allowanceSlotKey = nestedMappingSlot(
      ALICE as Address,
      SPENDER as Address,
      1n, // OZ allowance slot
    );

    const diffs: StateDiffEntry[] = [
      {
        address: DAI,
        key: allowanceSlotKey,
        before: uint256Hex((1n << 256n) - 1n),
        after: ZERO,
      },
    ];

    const events = [makeApprovalEvent(DAI, ALICE, SPENDER, "0", "DAI", 18)];
    const result = decodeERC20StateDiffs(diffs, events);

    expect(result.allowances).toHaveLength(1);
    expect(result.allowances[0]).toMatchObject({
      token: DAI,
      owner: ALICE.toLowerCase(),
      spender: SPENDER.toLowerCase(),
      afterFormatted: "0",
      layoutName: "oz",
    });
  });

  it("matches DAI layout (balance slot 2, allowance slot 3)", () => {
    const balanceSlot = mappingSlot(ALICE as Address, 2n); // DAI balance slot
    const allowanceSlotKey = nestedMappingSlot(
      ALICE as Address,
      SPENDER as Address,
      3n, // DAI allowance slot
    );

    const diffs: StateDiffEntry[] = [
      {
        address: DAI,
        key: balanceSlot,
        before: uint256Hex(500n * 10n ** 18n),
        after: uint256Hex(400n * 10n ** 18n),
      },
      {
        address: DAI,
        key: allowanceSlotKey,
        before: uint256Hex(1000n * 10n ** 18n),
        after: uint256Hex(900n * 10n ** 18n),
      },
    ];

    const events = [
      makeTransferEvent(DAI, ALICE, BOB, "DAI", 18),
      makeApprovalEvent(DAI, ALICE, SPENDER, "900", "DAI", 18),
    ];

    const result = decodeERC20StateDiffs(diffs, events);

    expect(result.balanceChanges.length).toBeGreaterThanOrEqual(1);
    const balance = result.balanceChanges.find(
      (c) => c.account === ALICE.toLowerCase() && c.layoutName === "dai",
    );
    expect(balance).toBeDefined();
    expect(balance!.deltaFormatted).toContain("-100");

    expect(result.allowances.length).toBeGreaterThanOrEqual(1);
    const allowance = result.allowances.find((a) => a.layoutName === "dai");
    expect(allowance).toBeDefined();
  });

  it("handles unlimited (MAX_UINT256) allowance after", () => {
    const allowanceSlotKey = nestedMappingSlot(
      ALICE as Address,
      SPENDER as Address,
      1n,
    );

    const maxUint = uint256Hex((1n << 256n) - 1n);
    const diffs: StateDiffEntry[] = [
      {
        address: USDC,
        key: allowanceSlotKey,
        before: ZERO,
        after: maxUint,
      },
    ];

    const events = [
      makeApprovalEvent(USDC, ALICE, SPENDER, ((1n << 256n) - 1n).toString(), "USDC", 6),
    ];
    const result = decodeERC20StateDiffs(diffs, events);

    expect(result.allowances).toHaveLength(1);
    expect(result.allowances[0]!.afterFormatted).toBe("Unlimited USDC");
  });

  it("deduplicates when multiple events match same account/layout", () => {
    const senderSlot = mappingSlot(ALICE as Address, 0n);

    const diffs: StateDiffEntry[] = [
      {
        address: DAI,
        key: senderSlot,
        before: uint256Hex(1000n * 10n ** 18n),
        after: uint256Hex(800n * 10n ** 18n),
      },
    ];

    // Two transfers from ALICE on same token
    const events = [
      makeTransferEvent(DAI, ALICE, BOB, "DAI", 18),
      makeTransferEvent(DAI, ALICE, SPENDER, "DAI", 18),
    ];

    const result = decodeERC20StateDiffs(diffs, events);

    // Should only match once per (token, account, layout)
    const aliceChanges = result.balanceChanges.filter(
      (c) => c.account === ALICE.toLowerCase() && c.layoutName === "oz",
    );
    expect(aliceChanges).toHaveLength(1);
  });

  it("handles case-insensitive address matching", () => {
    const upperDAI = DAI.toUpperCase().replace("0X", "0x");
    const senderSlot = mappingSlot(ALICE as Address, 0n);

    const diffs: StateDiffEntry[] = [
      {
        address: upperDAI as Address,
        key: senderSlot,
        before: uint256Hex(100n),
        after: uint256Hex(50n),
      },
    ];

    const events = [makeTransferEvent(DAI, ALICE, BOB)];
    const result = decodeERC20StateDiffs(diffs, events);

    expect(result.balanceChanges).toHaveLength(1);
  });

  it("handles multiple tokens in the same transaction", () => {
    const daiSlot = mappingSlot(ALICE as Address, 0n);
    const usdcSlot = mappingSlot(ALICE as Address, 0n);

    const diffs: StateDiffEntry[] = [
      {
        address: DAI,
        key: daiSlot,
        before: uint256Hex(1000n),
        after: uint256Hex(900n),
      },
      {
        address: USDC,
        key: usdcSlot,
        before: uint256Hex(500n),
        after: uint256Hex(400n),
      },
    ];

    const events = [
      makeTransferEvent(DAI, ALICE, BOB, "DAI", 18),
      makeTransferEvent(USDC, ALICE, BOB, "USDC", 6),
    ];

    const result = decodeERC20StateDiffs(diffs, events);

    expect(result.balanceChanges).toHaveLength(2);
    expect(result.balanceChanges.map((c) => c.token)).toContain(DAI);
    expect(result.balanceChanges.map((c) => c.token)).toContain(USDC);
  });

  it("skips non-transfer/non-approval events", () => {
    const senderSlot = mappingSlot(ALICE as Address, 0n);

    const diffs: StateDiffEntry[] = [
      {
        address: DAI,
        key: senderSlot,
        before: uint256Hex(100n),
        after: uint256Hex(50n),
      },
    ];

    const events: DecodedEvent[] = [
      {
        kind: "wrap",
        token: DAI,
        tokenSymbol: "DAI",
        tokenDecimals: 18,
        amountFormatted: "50",
        amountRaw: "50",
        from: ALICE,
        to: DAI,
        direction: "send",
      },
    ];

    const result = decodeERC20StateDiffs(diffs, events);
    expect(result.balanceChanges).toHaveLength(0);
    expect(result.allowances).toHaveLength(0);
  });
});
