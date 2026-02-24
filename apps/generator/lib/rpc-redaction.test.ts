import { describe, expect, it } from "bun:test";
import { redactRpcUrl } from "./rpc-redaction";

describe("redactRpcUrl", () => {
  it("redacts basic auth and sensitive query params", () => {
    const input = "https://user:pass@example.com/path?api-key=abc123&foo=bar";
    const output = redactRpcUrl(input);
    expect(output).toBe("https://***:***@example.com/path?api-key=***&foo=bar");
  });

  it("redacts Infura path keys", () => {
    const input = "https://mainnet.infura.io/v3/secretKeyValue";
    const output = redactRpcUrl(input);
    expect(output).toBe("https://mainnet.infura.io/v3/***");
  });

  it("redacts Alchemy path keys", () => {
    const input = "https://eth-mainnet.g.alchemy.com/v2/secretAlchemyKey";
    const output = redactRpcUrl(input);
    expect(output).toBe("https://eth-mainnet.g.alchemy.com/v2/***");
  });

  it("redacts marker-based key path segments", () => {
    const input = "https://rpc.provider.test/key/secret-path-token";
    const output = redactRpcUrl(input);
    expect(output).toBe("https://rpc.provider.test/key/***");
  });

  it("redacts malformed credential-like URLs", () => {
    const input = "user:pass@rpc.provider.test/key/secret";
    const output = redactRpcUrl(input);
    expect(output).toBe("[invalid URL redacted]");
  });

  it("keeps malformed non-URL strings with at-sign unchanged", () => {
    const input = "account@label";
    const output = redactRpcUrl(input);
    expect(output).toBe("account@label");
  });

  it("redacts malformed username-only authority pattern", () => {
    const input = "user@rpc.provider.test/path";
    const output = redactRpcUrl(input);
    expect(output).toBe("[invalid URL redacted]");
  });

  it("keeps non-URL plain strings unchanged", () => {
    const input = "not a url";
    const output = redactRpcUrl(input);
    expect(output).toBe("not a url");
  });
});
