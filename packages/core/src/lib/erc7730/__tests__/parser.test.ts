import { describe, it, expect } from "vitest";
import { parseDescriptor, parseDescriptorFromString } from "../parser";

describe("parseDescriptor", () => {
  it("parses a valid minimal descriptor", () => {
    const descriptor = {
      context: {
        contract: {
          deployments: [
            { chainId: 1, address: "0x1234567890123456789012345678901234567890" },
          ],
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

    const result = parseDescriptor(descriptor);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.descriptor.metadata.owner).toBe("TestProtocol");
    }
  });

  it("parses a descriptor with token metadata", () => {
    const descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0x1234567890123456789012345678901234567890" }],
        },
      },
      metadata: {
        owner: "TestProtocol",
        token: {
          name: "Test Token",
          ticker: "TST",
          decimals: 18,
        },
      },
      display: {
        formats: {},
      },
    };

    const result = parseDescriptor(descriptor);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.descriptor.metadata.token?.ticker).toBe("TST");
      expect(result.descriptor.metadata.token?.decimals).toBe(18);
    }
  });

  it("rejects a descriptor with missing metadata.owner", () => {
    const descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0x1234567890123456789012345678901234567890" }],
        },
      },
      metadata: {},
      display: {
        formats: {},
      },
    };

    const result = parseDescriptor(descriptor);
    expect(result.success).toBe(false);
  });

  it("rejects a descriptor with invalid deployment address", () => {
    const descriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "invalid" }],
        },
      },
      metadata: {
        owner: "TestProtocol",
      },
      display: {
        formats: {},
      },
    };

    const result = parseDescriptor(descriptor);
    expect(result.success).toBe(false);
  });
});

describe("parseDescriptorFromString", () => {
  it("parses a valid JSON string", () => {
    const json = JSON.stringify({
      context: {
        contract: {
          deployments: [{ chainId: 1, address: "0x1234567890123456789012345678901234567890" }],
        },
      },
      metadata: {
        owner: "TestProtocol",
      },
      display: {
        formats: {},
      },
    });

    const result = parseDescriptorFromString(json);
    expect(result.success).toBe(true);
  });

  it("rejects invalid JSON", () => {
    const result = parseDescriptorFromString("not valid json{");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("JSON parse error");
    }
  });
});
