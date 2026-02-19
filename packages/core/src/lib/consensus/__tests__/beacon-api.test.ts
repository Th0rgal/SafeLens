import { describe, expect, it } from "vitest";

import {
  BEACON_NETWORKS,
  CHAIN_ID_TO_BEACON_NETWORK,
  DEFAULT_BEACON_RPC_URLS,
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
});
