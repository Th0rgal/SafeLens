import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchExecutionConsensusProof } from "../execution-api";

const VALID_BLOCK = {
  number: "0x10",
  hash: `0x${"a".repeat(64)}`,
  parentHash: `0x${"b".repeat(64)}`,
  stateRoot: `0x${"c".repeat(64)}`,
  timestamp: "0x64",
};

function mockRpcResponses(...results: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: results.shift(),
            })
          )
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
    mockRpcResponses("0xa", VALID_BLOCK);

    const proof = await fetchExecutionConsensusProof(10, "opstack", {
      rpcUrl: "https://example.invalid/rpc",
    });

    expect(proof.network).toBe("optimism");
    expect(proof.consensusMode).toBe("opstack");
    expect(proof.stateRoot).toBe(VALID_BLOCK.stateRoot);
    expect(proof.blockNumber).toBe(16);
  });

  it("rejects malformed block hash fields from RPC", async () => {
    mockRpcResponses("0x2105", {
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
    mockRpcResponses("0xe708", {
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
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: "0xa",
            })
          )
        )
        .mockResolvedValueOnce(
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

  it("rejects RPC endpoints whose eth_chainId does not match requested chain", async () => {
    mockRpcResponses("0xa", VALID_BLOCK);

    await expect(
      fetchExecutionConsensusProof(8453, "opstack", {
        rpcUrl: "https://example.invalid/rpc",
      })
    ).rejects.toThrow("RPC eth_chainId mismatch: expected 8453, received 10.");
  });

  it("rejects malformed eth_chainId values from RPC", async () => {
    mockRpcResponses("base");

    await expect(
      fetchExecutionConsensusProof(8453, "opstack", {
        rpcUrl: "https://example.invalid/rpc",
      })
    ).rejects.toThrow("Invalid hex quantity for eth_chainId");
  });

  it("rejects execution mode mismatches for configured chains", async () => {
    await expect(
      fetchExecutionConsensusProof(10, "linea", {
        rpcUrl: "https://example.invalid/rpc",
      })
    ).rejects.toThrow(
      "Consensus mode mismatch for chain 10: expected 'opstack', received 'linea'."
    );
  });

  it("rejects execution envelopes for beacon-only chains", async () => {
    await expect(
      fetchExecutionConsensusProof(17000, "opstack", {
        rpcUrl: "https://example.invalid/rpc",
      })
    ).rejects.toThrow(
      "Chain 17000 uses beacon consensus mode; execution envelope mode 'opstack' is invalid."
    );
  });
});
