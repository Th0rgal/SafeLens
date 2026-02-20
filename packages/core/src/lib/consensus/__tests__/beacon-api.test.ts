import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BEACON_NETWORKS,
  CHAIN_ID_TO_BEACON_NETWORK,
  DEFAULT_BEACON_RPC_URLS,
  fetchConsensusProof,
} from "../beacon-api";

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
    await expect(fetchConsensusProof(17000)).rejects.toThrow(
      "No beacon chain config for chain ID 17000"
    );
  });

  it("fetches gnosis consensus proof through the /beacon light-client API path", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/eth/v1/beacon/light_client/finality_update")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              finalized_header: {
                beacon: { slot: "12345" },
                execution: {
                  state_root:
                    "0xa38574512fb60ec85617785cd52c30f918902b355bab53242fbdf3b40b7a1e7e",
                  block_number: "21000000",
                },
              },
              attested_header: {
                beacon: { slot: "12345" },
              },
            },
          }),
        };
      }
      if (url.endsWith("/eth/v1/beacon/headers/12345")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              root: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            },
          }),
        };
      }
      if (
        url.endsWith(
          "/eth/v1/beacon/light_client/bootstrap/0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        )
      ) {
        return {
          ok: true,
          json: async () => ({
            data: {
              header: {
                beacon: {
                  slot: "12288",
                },
              },
            },
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    const proof = await fetchConsensusProof(100);

    expect(proof.network).toBe("gnosis");
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

afterEach(() => {
  vi.unstubAllGlobals();
});
