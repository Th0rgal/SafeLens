import { describe, it, expect } from "vitest";
import {
  buildExecSimulationCallRequest,
  buildTraceCallAttempts,
} from "../fetcher";
import type { Address, Hex } from "viem";

describe("simulation fetcher RPC payloads", () => {
  const from = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as Address;
  const to = "0x9fc3dc011b461664c835f2527fffb1169b3c213e" as Address;
  const data =
    "0x6a7612020000000000000000000000000000000000000000000000000000000000000000" as Hex;
  const blockNumber = 24492059n;
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
      gasPrice,
      blockNumber,
      stateOverride
    );

    expect(req.account).toBe(from);
    expect(req.to).toBe(to);
    expect(req.data).toBe(data);
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
      gasPrice,
      blockNumber,
      overrideObject
    );

    expect(attempts).toHaveLength(3);
    expect(attempts[0].callObject.from).toBe(from);
    expect(attempts[0].callObject.to).toBe(to);
    expect(attempts[0].callObject.data).toBe(data);
    expect(attempts[0].callObject.gasPrice).toBe("0x12a05f200");
    expect(attempts[0].blockHex).toBe("0x175b81b");
    expect(attempts[0].traceConfig).toHaveProperty("stateOverrides");
    expect(attempts[1].traceConfig).toHaveProperty("stateOverride");
    expect(attempts[2].stateOverrideArg).toEqual(overrideObject);
  });

  it("omits gasPrice when transaction gasPrice is zero", () => {
    const req = buildExecSimulationCallRequest(
      from,
      to,
      data,
      0n,
      blockNumber,
      stateOverride
    );

    expect(req.gasPrice).toBeUndefined();

    const attempts = buildTraceCallAttempts(
      from,
      to,
      data,
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

    expect(attempts[0].callObject.gasPrice).toBeUndefined();
  });
});
