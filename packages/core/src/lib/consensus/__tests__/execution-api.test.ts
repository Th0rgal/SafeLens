import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchExecutionConsensusProof } from "../execution-api";

const VALID_BLOCK = {
  number: "0x10",
  hash: `0x${"a".repeat(64)}`,
  parentHash: `0x${"b".repeat(64)}`,
  stateRoot: `0x${"c".repeat(64)}`,
  timestamp: "0x64",
};

function mockRpcResult(result: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result,
        })
      )
    )
  );
}

describe("fetchExecutionConsensusProof", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("normalizes OP Mainnet network metadata to optimism", async () => {
    mockRpcResult(VALID_BLOCK);

    const proof = await fetchExecutionConsensusProof(10, "opstack", {
      rpcUrl: "https://example.invalid/rpc",
    });

    expect(proof.network).toBe("optimism");
    expect(proof.consensusMode).toBe("opstack");
    expect(proof.stateRoot).toBe(VALID_BLOCK.stateRoot);
    expect(proof.blockNumber).toBe(16);
  });

  it("rejects malformed block hash fields from RPC", async () => {
    mockRpcResult({
      ...VALID_BLOCK,
      hash: "0x1234",
    });

    await expect(
      fetchExecutionConsensusProof(8453, "opstack", {
        rpcUrl: "https://example.invalid/rpc",
      })
    ).rejects.toThrow("Invalid 32-byte hex value for block.hash");
  });

  it("rejects missing stateRoot from RPC", async () => {
    mockRpcResult({
      ...VALID_BLOCK,
      stateRoot: undefined,
    });

    await expect(
      fetchExecutionConsensusProof(59144, "linea", {
        rpcUrl: "https://example.invalid/rpc",
      })
    ).rejects.toThrow("Invalid 32-byte hex value for block.stateRoot");
  });

  it("surfaces JSON-RPC errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32000, message: "upstream failed" },
          })
        )
      )
    );

    await expect(
      fetchExecutionConsensusProof(10, "opstack", {
        rpcUrl: "https://example.invalid/rpc",
      })
    ).rejects.toThrow("RPC error -32000 for eth_getBlockByNumber: upstream failed");
  });
});
