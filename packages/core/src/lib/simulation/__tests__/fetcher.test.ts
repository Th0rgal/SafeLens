import { describe, it, expect } from "vitest";
import {
  buildExecSimulationCallRequest,
  buildTraceCallAttempts,
  collectCommittedLogsFromCallTrace,
  parseStateDiffsFromPrestateTrace,
} from "../fetcher";
import type { Address, Hex } from "viem";

describe("simulation fetcher RPC payloads", () => {
  const from = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as Address;
  const to = "0x9fc3dc011b461664c835f2527fffb1169b3c213e" as Address;
  const data =
    "0x6a7612020000000000000000000000000000000000000000000000000000000000000000" as Hex;
  const blockNumber = 24492059n;
  const gas = 30_000_000n;
  const gasPrice = 5_000_000_000n;
  const stateOverride = [
    {
      address: to,
      stateDiff: [
        {
          slot: "0x0000000000000000000000000000000000000000000000000000000000000003" as Hex,
          value:
            "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
        },
      ],
    },
  ];

  it("builds eth_call request with explicit account for sender parity", () => {
    const req = buildExecSimulationCallRequest(
      from,
      to,
      data,
      gas,
      gasPrice,
      blockNumber,
      stateOverride
    );

    expect(req.account).toBe(from);
    expect(req.to).toBe(to);
    expect(req.data).toBe(data);
    expect(req.gas).toBe(gas);
    expect(req.gasPrice).toBe(gasPrice);
    expect(req.blockNumber).toBe(blockNumber);
    expect(req.stateOverride).toEqual(stateOverride);
  });

  it("builds debug_traceCall attempts with from and compatible override shapes", () => {
    const overrideObject = {
      [to]: {
        stateDiff: {
          [stateOverride[0].stateDiff[0].slot]: stateOverride[0].stateDiff[0].value,
        },
      },
    };

    const attempts = buildTraceCallAttempts(
      from,
      to,
      data,
      gas,
      gasPrice,
      blockNumber,
      overrideObject
    );

    expect(attempts).toHaveLength(3);
    expect(attempts[0].callObject.from).toBe(from);
    expect(attempts[0].callObject.to).toBe(to);
    expect(attempts[0].callObject.data).toBe(data);
    expect(attempts[0].callObject.gas).toBe("0x1c9c380");
    expect(attempts[0].callObject.gasPrice).toBe("0x12a05f200");
    expect(attempts[0].blockHex).toBe("0x175b81b");
    expect(attempts[0].traceConfig).toHaveProperty("stateOverrides");
    expect(attempts[1].traceConfig).toHaveProperty("stateOverride");
    expect(attempts[2].stateOverrideArg).toEqual(overrideObject);
  });

  it("keeps explicit zero gasPrice for Foundry parity", () => {
    const req = buildExecSimulationCallRequest(
      from,
      to,
      data,
      gas,
      0n,
      blockNumber,
      stateOverride
    );

    expect(req.gasPrice).toBe(0n);

    const attempts = buildTraceCallAttempts(
      from,
      to,
      data,
      gas,
      0n,
      blockNumber,
      {
        [to]: {
          stateDiff: {
            [stateOverride[0].stateDiff[0].slot]:
              stateOverride[0].stateDiff[0].value,
          },
        },
      }
    );

    expect(attempts[0].callObject.gas).toBe("0x1c9c380");
    expect(attempts[0].callObject.gasPrice).toBe("0x0");
  });

  it("drops logs emitted by reverted frames", () => {
    const keepTopic =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

    const trace = {
      logs: [
        {
          address: to,
          topics: [keepTopic],
          data: "0x",
        },
      ],
      calls: [
        {
          error: "execution reverted",
          logs: [
            {
              address: to,
              topics: [keepTopic],
              data: "0x",
            },
          ],
        },
      ],
    };

    const logs = collectCommittedLogsFromCallTrace(trace);
    expect(logs).toHaveLength(1);
    expect(logs[0].address).toBe(to);
  });

  it("returns no logs when top-level call reverts", () => {
    const keepTopic =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

    const trace = {
      error: "execution reverted",
      logs: [
        {
          address: to,
          topics: [keepTopic],
          data: "0x",
        },
      ],
      calls: [
        {
          logs: [
            {
              address: to,
              topics: [keepTopic],
              data: "0x",
            },
          ],
        },
      ],
    };

    const logs = collectCommittedLogsFromCallTrace(trace);
    expect(logs).toEqual([]);
  });

  it("parses prestate tracer diff into normalized stateDiff entries", () => {
    const trace = {
      pre: {
        [to]: {
          storage: {
            "0x3":
              "0x0000000000000000000000000000000000000000000000000000000000000001",
          },
        },
      },
      post: {
        [to]: {
          storage: {
            "0x3":
              "0x0000000000000000000000000000000000000000000000000000000000000002",
            "0x4":
              "0x0000000000000000000000000000000000000000000000000000000000000001",
          },
        },
      },
    };

    const diffs = parseStateDiffsFromPrestateTrace(trace);
    expect(diffs).toHaveLength(2);
    expect(diffs?.[0].address).toBe(to);
    expect(diffs?.[0].key).toMatch(/^0x[0-9a-f]{64}$/);
    expect(diffs?.[0].before).toMatch(/^0x[0-9a-f]{64}$/);
    expect(diffs?.[0].after).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("returns undefined when prestate trace has no changed storage", () => {
    const trace = {
      pre: {
        [to]: {
          storage: {
            "0x3":
              "0x0000000000000000000000000000000000000000000000000000000000000001",
          },
        },
      },
      post: {
        [to]: {
          storage: {
            "0x3":
              "0x0000000000000000000000000000000000000000000000000000000000000001",
          },
        },
      },
    };

    expect(parseStateDiffsFromPrestateTrace(trace)).toBeUndefined();
  });
});
