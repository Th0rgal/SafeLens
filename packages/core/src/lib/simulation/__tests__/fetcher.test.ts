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
