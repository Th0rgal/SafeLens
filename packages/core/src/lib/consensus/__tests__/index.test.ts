import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchConsensusProof,
  UNSUPPORTED_CONSENSUS_MODE_ERROR_CODE,
} from "../index";
import * as beaconApi from "../beacon-api";
import * as executionApi from "../execution-api";

function mockExecutionRpc(chainIdHex: `0x${string}`, block: Record<string, string>) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: chainIdHex,
        })
      )
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: block,
        })
      )
    );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("consensus mode routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns an execution-header envelope for opstack chains", async () => {
    const fetchMock = mockExecutionRpc("0xa", {
      number: "0x10",
      hash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      parentHash:
        "0x3333333333333333333333333333333333333333333333333333333333333333",
      stateRoot:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      timestamp: "0x5",
    });

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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string).method
    ).toBe("eth_chainId");
    expect(
      JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string).method
    ).toBe("eth_getBlockByNumber");
  });

  it("returns an execution-header envelope for base", async () => {
    mockExecutionRpc("0x2105", {
      number: "0x20",
      hash: "0x4444444444444444444444444444444444444444444444444444444444444444",
      parentHash:
        "0x5555555555555555555555555555555555555555555555555555555555555555",
      stateRoot:
        "0x6666666666666666666666666666666666666666666666666666666666666666",
      timestamp: "0xa",
    });

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
    mockExecutionRpc("0xe708", {
      number: "0x2a",
      hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      parentHash:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      stateRoot:
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      timestamp: "0x64",
    });

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

  it("rejects opstack envelopes when rollout override disables the mode", async () => {
    await expect(
      fetchConsensusProof(10, {
        enableExperimentalOpstackConsensus: false,
      })
    ).rejects.toMatchObject({
      code: UNSUPPORTED_CONSENSUS_MODE_ERROR_CODE,
      consensusMode: "opstack",
      reason: "disabled-by-feature-flag",
    });
  });

  it("rejects linea envelopes when rollout override disables the mode", async () => {
    await expect(
      fetchConsensusProof(59144, {
        enableExperimentalLineaConsensus: false,
      })
    ).rejects.toMatchObject({
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
      })
    ).rejects.toThrow(
      "Execution consensus envelopes require blockTag='finalized'; received 'safe'."
    );
  });

  it("routes holesky through beacon consensus fetcher", async () => {
    const beaconSpy = vi
      .spyOn(beaconApi, "fetchConsensusProof")
      .mockResolvedValue({
        consensusMode: "beacon",
        checkpoint: `0x${"a".repeat(64)}`,
        bootstrap: "{}",
        updates: [],
        finalityUpdate: "{}",
        network: "holesky",
        stateRoot: `0x${"b".repeat(64)}`,
        blockNumber: 123,
        finalizedSlot: 456,
      });
    const executionSpy = vi.spyOn(executionApi, "fetchExecutionConsensusProof");

    const proof = await fetchConsensusProof(17000, {
      beaconRpcUrl: "https://example.invalid/beacon",
    });

    expect(proof).toMatchObject({
      consensusMode: "beacon",
      network: "holesky",
      blockNumber: 123,
    });
    expect(beaconSpy).toHaveBeenCalledWith(17000, {
      beaconRpcUrl: "https://example.invalid/beacon",
    });
    expect(executionSpy).not.toHaveBeenCalled();
  });

  it("routes hoodi through beacon consensus fetcher", async () => {
    const beaconSpy = vi
      .spyOn(beaconApi, "fetchConsensusProof")
      .mockResolvedValue({
        consensusMode: "beacon",
        checkpoint: `0x${"c".repeat(64)}`,
        bootstrap: "{}",
        updates: [],
        finalityUpdate: "{}",
        network: "hoodi",
        stateRoot: `0x${"d".repeat(64)}`,
        blockNumber: 789,
        finalizedSlot: 987,
      });
    const executionSpy = vi.spyOn(executionApi, "fetchExecutionConsensusProof");

    const proof = await fetchConsensusProof(560048, {
      beaconRpcUrl: "https://example.invalid/beacon",
    });

    expect(proof).toMatchObject({
      consensusMode: "beacon",
      network: "hoodi",
      blockNumber: 789,
    });
    expect(beaconSpy).toHaveBeenCalledWith(560048, {
      beaconRpcUrl: "https://example.invalid/beacon",
    });
    expect(executionSpy).not.toHaveBeenCalled();
  });
});
