import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { __internal } from "../fetcher";

describe("simulation fetcher replay witness helpers", () => {
  it("extracts replay accounts from prestate trace and normalizes storage words", () => {
    const accounts = __internal.traceToReplayAccounts(
      {
        "0x1000000000000000000000000000000000000001": {
          balance: "0x2a",
          nonce: "0x2",
          code: "0x6000",
          storage: {
            "0x1": "0x5",
          },
        },
        "0x2000000000000000000000000000000000000002": {
          balance: "0x0",
          nonce: "0x0",
          code: "0x",
          storage: {},
        },
      },
      [
        "0x1000000000000000000000000000000000000001",
        "0x2000000000000000000000000000000000000002",
      ] as Address[]
    );

    expect(accounts).toHaveLength(2);
    const first = accounts?.find(
      (account) => account.address === "0x1000000000000000000000000000000000000001"
    );
    expect(first?.balance).toBe("0x2a");
    expect(first?.nonce).toBe(2);
    expect(first?.storage).toMatchObject({
      "0x0000000000000000000000000000000000000000000000000000000000000001":
        "0x0000000000000000000000000000000000000000000000000000000000000005",
    });
  });

  it("returns undefined when required addresses are missing", () => {
    const accounts = __internal.traceToReplayAccounts(
      {
        "0x1000000000000000000000000000000000000001": {
          balance: "0x1",
          nonce: "0x1",
          code: "0x",
          storage: {},
        },
      },
      [
        "0x1000000000000000000000000000000000000001",
        "0x2000000000000000000000000000000000000002",
      ] as Address[]
    );

    expect(accounts).toBeUndefined();
  });

  it("normalizes replay gas limit from safeTxGas with bounded fallback", () => {
    expect(__internal.normalizeReplayGasLimit("21000")).toBe(21000);
    expect(__internal.normalizeReplayGasLimit("0")).toBe(3000000);
    expect(__internal.normalizeReplayGasLimit("invalid")).toBe(3000000);
  });
});

describe("extractStateDiffs", () => {
  const ADDR_A = "0x1000000000000000000000000000000000000001";
  const ADDR_B = "0x2000000000000000000000000000000000000002";
  const SLOT_1 = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const SLOT_2 = "0x0000000000000000000000000000000000000000000000000000000000000002";
  const ZERO = "0x" + "00".repeat(32);

  it("extracts changed storage slots between pre and post", () => {
    const diffs = __internal.extractStateDiffs(
      {
        [ADDR_A]: { storage: { "0x1": "0x5" } },
      },
      {
        [ADDR_A]: { storage: { "0x1": "0xa" } },
      }
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      address: ADDR_A.toLowerCase(),
      key: SLOT_1,
      before: "0x0000000000000000000000000000000000000000000000000000000000000005",
      after: "0x000000000000000000000000000000000000000000000000000000000000000a",
    });
  });

  it("treats missing pre-state slot as zero", () => {
    const diffs = __internal.extractStateDiffs(
      {},
      {
        [ADDR_A]: { storage: { "0x1": "0x1" } },
      }
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0].before).toBe(ZERO);
    expect(diffs[0].after).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000001"
    );
  });

  it("treats missing post-state slot as zero", () => {
    const diffs = __internal.extractStateDiffs(
      {
        [ADDR_A]: { storage: { "0x1": "0x1" } },
      },
      {}
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0].after).toBe(ZERO);
  });

  it("excludes unchanged slots", () => {
    const diffs = __internal.extractStateDiffs(
      {
        [ADDR_A]: { storage: { "0x1": "0x5", "0x2": "0x10" } },
      },
      {
        [ADDR_A]: { storage: { "0x1": "0x5", "0x2": "0x20" } },
      }
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0].key).toBe(SLOT_2);
  });

  it("handles multiple addresses", () => {
    const diffs = __internal.extractStateDiffs(
      {
        [ADDR_A]: { storage: { "0x1": "0x1" } },
        [ADDR_B]: { storage: { "0x2": "0x2" } },
      },
      {
        [ADDR_A]: { storage: { "0x1": "0x2" } },
        [ADDR_B]: { storage: { "0x2": "0x3" } },
      }
    );

    expect(diffs).toHaveLength(2);
    const addrADiff = diffs.find((d) => d.address === ADDR_A.toLowerCase());
    const addrBDiff = diffs.find((d) => d.address === ADDR_B.toLowerCase());
    expect(addrADiff).toBeDefined();
    expect(addrBDiff).toBeDefined();
  });

  it("returns empty array when no storage changes", () => {
    const diffs = __internal.extractStateDiffs(
      {
        [ADDR_A]: { storage: { "0x1": "0x5" } },
      },
      {
        [ADDR_A]: { storage: { "0x1": "0x5" } },
      }
    );

    expect(diffs).toHaveLength(0);
  });

  it("returns empty array for empty pre/post", () => {
    const diffs = __internal.extractStateDiffs({}, {});
    expect(diffs).toHaveLength(0);
  });

  it("skips non-address keys in trace", () => {
    const diffs = __internal.extractStateDiffs(
      {
        "not-an-address": { storage: { "0x1": "0x1" } },
        [ADDR_A]: { storage: { "0x1": "0x1" } },
      },
      {
        "not-an-address": { storage: { "0x1": "0x2" } },
        [ADDR_A]: { storage: { "0x1": "0x2" } },
      }
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0].address).toBe(ADDR_A.toLowerCase());
  });
});
