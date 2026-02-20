import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchConsensusProof,
  UNSUPPORTED_CONSENSUS_MODE_ERROR_CODE,
} from "../index";

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
      network: "optimism",
      blockNumber: 16,
      stateRoot:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
    });
    expect("proofPayload" in proof).toBe(true);
  });

  it("returns an execution-header envelope for base", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              number: "0x20",
              hash: "0x4444444444444444444444444444444444444444444444444444444444444444",
              parentHash:
                "0x5555555555555555555555555555555555555555555555555555555555555555",
              stateRoot:
                "0x6666666666666666666666666666666666666666666666666666666666666666",
              timestamp: "0xa",
            },
          })
        )
      )
    );

    const proof = await fetchConsensusProof(8453, {
      rpcUrl: "https://example.invalid/rpc",
      blockTag: "finalized",
    });

    expect(proof).toMatchObject({
      consensusMode: "opstack",
      network: "base",
      blockNumber: 32,
      stateRoot:
        "0x6666666666666666666666666666666666666666666666666666666666666666",
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
      enableExperimentalLineaConsensus: true,
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

  it("rejects linea envelopes when rollout feature flag is disabled", async () => {
    await expect(fetchConsensusProof(59144)).rejects.toMatchObject({
      code: UNSUPPORTED_CONSENSUS_MODE_ERROR_CODE,
      consensusMode: "linea",
      reason: "disabled-by-feature-flag",
    });
  });

  it("rejects chains without any configured consensus path", async () => {
    await expect(fetchConsensusProof(137)).rejects.toThrow(
      "No consensus verification path is configured for chain ID 137."
    );
  });

  it("rejects non-finalized block tags for opstack envelopes", async () => {
    await expect(
      fetchConsensusProof(10, {
        rpcUrl: "https://example.invalid/rpc",
        blockTag: "latest",
      })
    ).rejects.toThrow(
      "Execution consensus envelopes require blockTag='finalized'; received 'latest'."
    );
  });

  it("rejects non-finalized block tags for linea envelopes", async () => {
    await expect(
      fetchConsensusProof(59144, {
        rpcUrl: "https://example.invalid/rpc",
        blockTag: "safe",
        enableExperimentalLineaConsensus: true,
      })
    ).rejects.toThrow(
      "Execution consensus envelopes require blockTag='finalized'; received 'safe'."
    );
  });
});
