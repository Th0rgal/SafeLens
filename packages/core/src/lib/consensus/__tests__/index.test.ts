import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchConsensusProof } from "../index";

describe("consensus mode routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns an execution-header envelope for opstack chains", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              number: "0x10",
              hash: "0x2222222222222222222222222222222222222222222222222222222222222222",
              parentHash:
                "0x3333333333333333333333333333333333333333333333333333333333333333",
              stateRoot:
                "0x1111111111111111111111111111111111111111111111111111111111111111",
              timestamp: "0x5",
            },
          })
        )
      )
    );

    const proof = await fetchConsensusProof(10, {
      rpcUrl: "https://example.invalid/rpc",
      blockTag: "finalized",
    });

    expect(proof).toMatchObject({
      consensusMode: "opstack",
      network: "oeth",
      blockNumber: 16,
      stateRoot:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
    });
    expect("proofPayload" in proof).toBe(true);
  });

  it("returns an execution-header envelope for linea chains", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              number: "0x2a",
              hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              parentHash:
                "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              stateRoot:
                "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
              timestamp: "0x64",
            },
          })
        )
      )
    );

    const proof = await fetchConsensusProof(59144, {
      rpcUrl: "https://example.invalid/rpc",
    });

    expect(proof).toMatchObject({
      consensusMode: "linea",
      network: "linea",
      blockNumber: 42,
      stateRoot:
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    });
    expect("proofPayload" in proof).toBe(true);
  });

  it("rejects chains without any configured consensus path", async () => {
    await expect(fetchConsensusProof(137)).rejects.toThrow(
      "No consensus verification path is configured for chain ID 137."
    );
  });
});
