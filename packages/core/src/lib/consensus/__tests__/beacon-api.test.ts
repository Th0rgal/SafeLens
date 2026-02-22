import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BEACON_NETWORKS,
  CHAIN_ID_TO_BEACON_NETWORK,
  DEFAULT_BEACON_RPC_URLS,
  fetchConsensusProof,
} from "../beacon-api";

// Gnosis: slotsPerPeriod = 16 * 256 = 4096
const GNOSIS_SLOTS_PER_PERIOD = 4096;

function makeFinalityUpdate(
  finalizedSlot: string,
  attestedSlot: string,
  stateRoot = "0xa38574512fb60ec85617785cd52c30f918902b355bab53242fbdf3b40b7a1e7e",
  blockNumber = "21000000",
) {
  return {
    data: {
      finalized_header: {
        beacon: { slot: finalizedSlot },
        execution: { state_root: stateRoot, block_number: blockNumber },
      },
      attested_header: { beacon: { slot: attestedSlot } },
    },
  };
}

function makeHeaderResponse(root: string) {
  return { data: { root } };
}

function makeBootstrap(slot: string) {
  return { data: { header: { beacon: { slot } } } };
}

const CHECKPOINT =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("beacon-api network config", () => {
  it("maps chainId 100 to gnosis", () => {
    expect(CHAIN_ID_TO_BEACON_NETWORK[100]).toBe("gnosis");
  });

  it("uses a working light-client endpoint path for gnosis", () => {
    const url = DEFAULT_BEACON_RPC_URLS.gnosis;
    expect(url).toBe("https://rpc.gnosischain.com/beacon");
    expect(url.endsWith("/beacon")).toBe(true);
  });

  it("keeps gnosis consensus timing constants", () => {
    const gnosis = BEACON_NETWORKS.gnosis;
    expect(gnosis.secondsPerSlot).toBe(5);
    expect(gnosis.network).toBe("gnosis");
  });

  it("rejects unsupported chain IDs for consensus proof fetching", async () => {
    await expect(fetchConsensusProof(137)).rejects.toThrow(
      "No beacon chain config for chain ID 137"
    );
  });

  it("fetches gnosis consensus proof through the /beacon light-client API path", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/eth/v1/beacon/light_client/finality_update")) {
        return { ok: true, json: async () => makeFinalityUpdate("12345", "12345") };
      }
      if (url.endsWith("/eth/v1/beacon/headers/12345")) {
        return { ok: true, json: async () => makeHeaderResponse(CHECKPOINT) };
      }
      if (url.endsWith(`/eth/v1/beacon/light_client/bootstrap/${CHECKPOINT}`)) {
        return { ok: true, json: async () => makeBootstrap("12288") };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    const proof = await fetchConsensusProof(100);

    expect(proof.network).toBe("gnosis");
    expect(proof.consensusMode).toBe("beacon");
    expect(proof.finalizedSlot).toBe(12345);
    expect(proof.blockNumber).toBe(21000000);
    expect(proof.stateRoot).toBe(
      "0xa38574512fb60ec85617785cd52c30f918902b355bab53242fbdf3b40b7a1e7e"
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    for (const calledUrl of calledUrls) {
      expect(calledUrl.startsWith("https://rpc.gnosischain.com/beacon/")).toBe(
        true
      );
    }
  });
});

describe("beacon-api period boundary handling", () => {
  it("fetches sync committee updates with correct start_period when periods differ", async () => {
    // Bootstrap period 2, attested period 3 → needs update for period 2
    const bootstrapSlot = String(2 * GNOSIS_SLOTS_PER_PERIOD); // 8192
    const attestedSlot = String(3 * GNOSIS_SLOTS_PER_PERIOD + 10); // 12298
    const finalizedSlot = String(3 * GNOSIS_SLOTS_PER_PERIOD + 5); // 12293

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/eth/v1/beacon/light_client/finality_update")) {
        return { ok: true, json: async () => makeFinalityUpdate(finalizedSlot, attestedSlot) };
      }
      if (url.endsWith(`/eth/v1/beacon/headers/${finalizedSlot}`)) {
        return { ok: true, json: async () => makeHeaderResponse(CHECKPOINT) };
      }
      if (url.endsWith(`/eth/v1/beacon/light_client/bootstrap/${CHECKPOINT}`)) {
        return { ok: true, json: async () => makeBootstrap(bootstrapSlot) };
      }
      if (url.includes("/eth/v1/beacon/light_client/updates")) {
        // Verify start_period = bootstrapPeriod (2), not bootstrapPeriod + 1 (3)
        expect(url).toContain("start_period=2");
        expect(url).toContain("count=1");
        return {
          ok: true,
          json: async () => [{ data: { attested_header: { beacon: { slot: bootstrapSlot } } } }],
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    const proof = await fetchConsensusProof(100);

    expect(proof.updates).toHaveLength(1);
    expect(proof.finalizedSlot).toBe(Number(finalizedSlot));
  });

  it("retries on period boundary when updates endpoint returns 400", async () => {
    // First attempt: bootstrap in period 6475, attested in 6476 (boundary)
    // Second attempt: both in period 6476 (finality advanced)
    const boundaryBootstrapSlot = String(6475 * GNOSIS_SLOTS_PER_PERIOD + 4000); // end of period 6475
    const boundaryAttestedSlot = String(6476 * GNOSIS_SLOTS_PER_PERIOD + 5); // start of period 6476
    const boundaryFinalizedSlot = String(6475 * GNOSIS_SLOTS_PER_PERIOD + 4090);

    const resolvedBootstrapSlot = String(6476 * GNOSIS_SLOTS_PER_PERIOD + 32); // both in 6476
    const resolvedAttestedSlot = String(6476 * GNOSIS_SLOTS_PER_PERIOD + 50);
    const resolvedFinalizedSlot = String(6476 * GNOSIS_SLOTS_PER_PERIOD + 40);

    const RESOLVED_CHECKPOINT =
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

    let attemptCount = 0;

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/eth/v1/beacon/light_client/finality_update")) {
        attemptCount++;
        if (attemptCount === 1) {
          return {
            ok: true,
            json: async () => makeFinalityUpdate(boundaryFinalizedSlot, boundaryAttestedSlot),
          };
        }
        return {
          ok: true,
          json: async () =>
            makeFinalityUpdate(
              resolvedFinalizedSlot,
              resolvedAttestedSlot,
              "0xdd00000000000000000000000000000000000000000000000000000000000000",
              "22000000",
            ),
        };
      }
      if (url.endsWith(`/eth/v1/beacon/headers/${boundaryFinalizedSlot}`)) {
        return { ok: true, json: async () => makeHeaderResponse(CHECKPOINT) };
      }
      if (url.endsWith(`/eth/v1/beacon/headers/${resolvedFinalizedSlot}`)) {
        return { ok: true, json: async () => makeHeaderResponse(RESOLVED_CHECKPOINT) };
      }
      if (url.endsWith(`/eth/v1/beacon/light_client/bootstrap/${CHECKPOINT}`)) {
        return { ok: true, json: async () => makeBootstrap(boundaryBootstrapSlot) };
      }
      if (url.endsWith(`/eth/v1/beacon/light_client/bootstrap/${RESOLVED_CHECKPOINT}`)) {
        return { ok: true, json: async () => makeBootstrap(resolvedBootstrapSlot) };
      }
      if (url.includes("/eth/v1/beacon/light_client/updates")) {
        // Simulate Gnosis beacon node returning 400 for recent periods
        return { ok: false, status: 400, statusText: "Bad Request", text: async () => "Invalid sync committee period" };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    // Use fake timers so the retry delay doesn't slow down the test
    vi.useFakeTimers();

    const proofPromise = fetchConsensusProof(100);
    // Advance through the retry delay
    await vi.advanceTimersByTimeAsync(10_000);

    const proof = await proofPromise;

    expect(proof.network).toBe("gnosis");
    expect(proof.blockNumber).toBe(22000000);
    expect(proof.updates).toEqual([]);
    expect(attemptCount).toBe(2);

    vi.useRealTimers();
  });

  it("throws after exhausting retries at period boundary", async () => {
    // All attempts stay at a period boundary and updates always fail
    const bootstrapSlot = String(6475 * GNOSIS_SLOTS_PER_PERIOD + 4000);
    const attestedSlot = String(6476 * GNOSIS_SLOTS_PER_PERIOD + 5);
    const finalizedSlot = String(6475 * GNOSIS_SLOTS_PER_PERIOD + 4090);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/eth/v1/beacon/light_client/finality_update")) {
        return { ok: true, json: async () => makeFinalityUpdate(finalizedSlot, attestedSlot) };
      }
      if (url.endsWith(`/eth/v1/beacon/headers/${finalizedSlot}`)) {
        return { ok: true, json: async () => makeHeaderResponse(CHECKPOINT) };
      }
      if (url.endsWith(`/eth/v1/beacon/light_client/bootstrap/${CHECKPOINT}`)) {
        return { ok: true, json: async () => makeBootstrap(bootstrapSlot) };
      }
      if (url.includes("/eth/v1/beacon/light_client/updates")) {
        return { ok: false, status: 400, statusText: "Bad Request", text: async () => "Invalid sync committee period" };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    // Attach a handler immediately so the rejection is never "unhandled"
    let caughtError: Error | undefined;
    const proofPromise = fetchConsensusProof(100).catch((e: Error) => {
      caughtError = e;
    });
    // Advance through all retry delays (3 retries * 10s each).
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
    }
    await proofPromise;

    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toMatch(/sync committee updates unavailable/i);

    vi.useRealTimers();
  });

  it("does not retry when periods match (no updates needed)", async () => {
    // Both bootstrap and attested in same period, no updates, no retries
    const slot = String(6476 * GNOSIS_SLOTS_PER_PERIOD + 100);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/eth/v1/beacon/light_client/finality_update")) {
        return { ok: true, json: async () => makeFinalityUpdate(slot, slot) };
      }
      if (url.endsWith(`/eth/v1/beacon/headers/${slot}`)) {
        return { ok: true, json: async () => makeHeaderResponse(CHECKPOINT) };
      }
      if (url.endsWith(`/eth/v1/beacon/light_client/bootstrap/${CHECKPOINT}`)) {
        return { ok: true, json: async () => makeBootstrap(slot) };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    const proof = await fetchConsensusProof(100);

    expect(proof.updates).toEqual([]);
    // Only 3 calls: finality_update, headers, bootstrap, no updates endpoint hit
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("beacon-api bootstrap fallback", () => {
  // Gnosis: slotsPerEpoch = 16
  const GNOSIS_SLOTS_PER_EPOCH = 16;

  it("falls back to epoch-boundary slot when bootstrap returns 404", async () => {
    // Finalized slot 26525855 (not an epoch boundary: 26525855 / 16 = 1657865.9375)
    // Epoch boundary slot: floor(26525855/16)*16 = 26525840
    const finalizedSlot = "26525855";
    const epochBoundarySlot = String(
      Math.floor(Number(finalizedSlot) / GNOSIS_SLOTS_PER_EPOCH) * GNOSIS_SLOTS_PER_EPOCH
    ); // "26525840"

    const PRIMARY_ROOT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const FALLBACK_ROOT = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/eth/v1/beacon/light_client/finality_update")) {
        return { ok: true, json: async () => makeFinalityUpdate(finalizedSlot, finalizedSlot) };
      }
      if (url.endsWith(`/eth/v1/beacon/headers/${finalizedSlot}`)) {
        return { ok: true, json: async () => makeHeaderResponse(PRIMARY_ROOT) };
      }
      if (url.endsWith(`/eth/v1/beacon/light_client/bootstrap/${PRIMARY_ROOT}`)) {
        // Simulate Gnosis returning 404 for non-epoch-boundary block roots
        return { ok: false, status: 404, statusText: "Not Found", text: async () => "bootstrap not found" };
      }
      if (url.endsWith(`/eth/v1/beacon/headers/${epochBoundarySlot}`)) {
        return { ok: true, json: async () => makeHeaderResponse(FALLBACK_ROOT) };
      }
      if (url.endsWith(`/eth/v1/beacon/light_client/bootstrap/${FALLBACK_ROOT}`)) {
        return { ok: true, json: async () => makeBootstrap(epochBoundarySlot) };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    const proof = await fetchConsensusProof(100);

    expect(proof.network).toBe("gnosis");
    expect(proof.checkpoint).toBe(FALLBACK_ROOT);
    // Execution data still comes from the finality update, not the bootstrap
    expect(proof.finalizedSlot).toBe(Number(finalizedSlot));
  });

  it("skips missed epoch-boundary slots and tries earlier epochs", async () => {
    // Finalized slot 26525855, epoch boundary 26525840 is missed (404),
    // previous epoch boundary 26525824 works.
    const finalizedSlot = "26525855";
    const missedEpochSlot = String(
      Math.floor(Number(finalizedSlot) / GNOSIS_SLOTS_PER_EPOCH) * GNOSIS_SLOTS_PER_EPOCH
    ); // "26525840"
    const prevEpochSlot = String(Number(missedEpochSlot) - GNOSIS_SLOTS_PER_EPOCH); // "26525824"

    const PRIMARY_ROOT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const PREV_ROOT = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/eth/v1/beacon/light_client/finality_update")) {
        return { ok: true, json: async () => makeFinalityUpdate(finalizedSlot, finalizedSlot) };
      }
      if (url.endsWith(`/eth/v1/beacon/headers/${finalizedSlot}`)) {
        return { ok: true, json: async () => makeHeaderResponse(PRIMARY_ROOT) };
      }
      if (url.endsWith(`/eth/v1/beacon/light_client/bootstrap/${PRIMARY_ROOT}`)) {
        return { ok: false, status: 404, statusText: "Not Found", text: async () => "not found" };
      }
      if (url.endsWith(`/eth/v1/beacon/headers/${missedEpochSlot}`)) {
        // Missed slot
        return { ok: false, status: 404, statusText: "Not Found", text: async () => "not found" };
      }
      if (url.endsWith(`/eth/v1/beacon/headers/${prevEpochSlot}`)) {
        return { ok: true, json: async () => makeHeaderResponse(PREV_ROOT) };
      }
      if (url.endsWith(`/eth/v1/beacon/light_client/bootstrap/${PREV_ROOT}`)) {
        return { ok: true, json: async () => makeBootstrap(prevEpochSlot) };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    const proof = await fetchConsensusProof(100);

    expect(proof.checkpoint).toBe(PREV_ROOT);
    expect(proof.finalizedSlot).toBe(Number(finalizedSlot));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
