import { describe, it, expect } from "vitest";
import {
  computeSelector,
  isSelector,
  normalizeFormatKey,
  buildIndex,
  lookupFormat,
} from "../index";
import type { ERC7730Descriptor } from "../types";

describe("computeSelector", () => {
  it("computes the correct selector for transfer(address,uint256)", () => {
    const selector = computeSelector("transfer(address,uint256)");
    expect(selector).toBe("0xa9059cbb");
  });

  it("computes the correct selector for submit(address)", () => {
    const selector = computeSelector("submit(address)");
    expect(selector).toBe("0xa1903eab");
  });
});

describe("isSelector", () => {
  it("recognizes a valid 4-byte selector", () => {
    expect(isSelector("0xa9059cbb")).toBe(true);
    expect(isSelector("0x12345678")).toBe(true);
  });

  it("rejects invalid selectors", () => {
    expect(isSelector("0xa9059c")).toBe(false); // too short
    expect(isSelector("0xa9059cbbaa")).toBe(false); // too long
    expect(isSelector("a9059cbb")).toBe(false); // missing 0x
    expect(isSelector("transfer(address,uint256)")).toBe(false);
  });
});

describe("normalizeFormatKey", () => {
  it("returns a selector as-is (lowercased)", () => {
    expect(normalizeFormatKey("0xA9059CBB")).toBe("0xa9059cbb");
  });

  it("computes a selector from a function signature", () => {
    expect(normalizeFormatKey("transfer(address,uint256)")).toBe("0xa9059cbb");
  });
});

describe("buildIndex", () => {
  it("builds an index from a single descriptor", () => {
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0x1234567890123456789012345678901234567890" }],
        },
      },
      metadata: {
        owner: "TestProtocol",
      },
      display: {
        formats: {
          "testMethod()": {
            intent: "Test action",
            fields: [],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);
    expect(index.descriptors).toHaveLength(1);
    expect(index.entries.size).toBeGreaterThan(0);
  });

  it("indexes by function signature", () => {
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0xAe7ab96520DE3A18E5e111B5EaAb095312D7fE84" }],
        },
      },
      metadata: {
        owner: "Lido",
      },
      display: {
        formats: {
          "submit(address)": {
            intent: "Stake ETH",
            fields: [],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);
    const entry = lookupFormat(index, 1, "0xAe7ab96520DE3A18E5e111B5EaAb095312D7fE84", "0xa1903eab");
    expect(entry).not.toBeNull();
    expect(entry?.formatEntry.intent).toBe("Stake ETH");
  });

  it("handles case-insensitive address matching", () => {
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0xAe7ab96520DE3A18E5e111B5EaAb095312D7fE84" }],
        },
      },
      metadata: {
        owner: "Lido",
      },
      display: {
        formats: {
          "submit(address)": {
            intent: "Stake ETH",
            fields: [],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);

    // Lookup with different case
    const entry = lookupFormat(index, 1, "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", "0xa1903eab");
    expect(entry).not.toBeNull();
    expect(entry?.formatEntry.intent).toBe("Stake ETH");
  });

  it("returns null for unknown contract/selector", () => {
    const descriptor: ERC7730Descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0x1234567890123456789012345678901234567890" }],
        },
      },
      metadata: {
        owner: "TestProtocol",
      },
      display: {
        formats: {
          "testMethod()": {
            intent: "Test action",
            fields: [],
          },
        },
      },
    };

    const index = buildIndex([descriptor]);
    const entry = lookupFormat(index, 1, "0x9999999999999999999999999999999999999999", "0x12345678");
    expect(entry).toBeNull();
  });
});
