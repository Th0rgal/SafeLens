import { describe, expect, it } from "vitest";
import {
  SUPPORTED_CHAIN_IDS,
  getChainName,
  getChainPrefix,
  getSafeApiUrl,
  parseSafeUrl,
  parseSafeUrlFlexible,
} from "../url-parser";

describe("safe url parser network mappings", () => {
  it("parses known prefixes using the shared network matrix", () => {
    const parsed = parseSafeUrl(
      "https://app.safe.global/transactions/tx?safe=gno:0x1111111111111111111111111111111111111111&id=multisig_0x1111111111111111111111111111111111111111_0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    expect(parsed.chainId).toBe(100);
  });

  it("returns consistent chain labels and API URLs", () => {
    expect(getChainPrefix(1)).toBe("eth");
    expect(getChainName(11155111)).toBe("Sepolia");
    expect(getChainPrefix(59144)).toBe("linea");
    expect(getSafeApiUrl(100)).toBe(
      "https://safe-transaction-gnosis-chain.safe.global"
    );
    expect(getSafeApiUrl(59144)).toBe(
      "https://safe-transaction-linea.safe.global"
    );
  });

  it("keeps safe-address chain search list explicit", () => {
    expect(SUPPORTED_CHAIN_IDS).toEqual([1, 11155111, 137, 42161, 10, 100, 8453, 59144]);
  });

  it("rejects non-safe.global origins", () => {
    expect(() =>
      parseSafeUrl(
        "https://evil.example/transactions/tx?safe=eth:0x1111111111111111111111111111111111111111&id=multisig_0x1111111111111111111111111111111111111111_0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      )
    ).toThrow(/Unsupported Safe host/);
  });

  it("rejects mismatched safe addresses between safe and id params", () => {
    expect(() =>
      parseSafeUrlFlexible(
        "https://app.safe.global/transactions/tx?safe=eth:0x1111111111111111111111111111111111111111&id=multisig_0x2222222222222222222222222222222222222222_0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      )
    ).toThrow(/Conflicting Safe addresses/);
  });
});
