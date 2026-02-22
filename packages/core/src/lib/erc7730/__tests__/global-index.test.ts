import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getGlobalIndex,
  resetGlobalIndex,
  setGlobalDescriptors,
} from "../global-index";

describe("global ERC-7730 index", () => {
  afterEach(() => {
    resetGlobalIndex();
    vi.restoreAllMocks();
  });

  it("rebuilds index from raw descriptors and skips invalid entries", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    setGlobalDescriptors([
      {
        context: {
          contract: {
            deployments: [
              {
                chainId: 1,
                address: "0x1234567890123456789012345678901234567890",
              },
            ],
          },
        },
        metadata: { owner: "ValidProtocol" },
        display: {
          formats: {
            "testMethod()": {
              intent: "Test action",
              fields: [],
            },
          },
        },
      },
      {
        // Invalid descriptor: missing metadata.owner
        context: {
          contract: {
            deployments: [
              {
                chainId: 1,
                address: "0x9999999999999999999999999999999999999999",
              },
            ],
          },
        },
        metadata: {},
        display: { formats: {} },
      },
    ]);

    const index = getGlobalIndex();
    expect(index.descriptors).toHaveLength(1);
    expect(index.descriptors[0].metadata.owner).toBe("ValidProtocol");
    expect(index.entries.size).toBe(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
