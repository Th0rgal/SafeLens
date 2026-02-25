import { describe, expect, it } from "vitest";
import { formatTokenAmount } from "../token-utils";

describe("formatTokenAmount", () => {
  it("formats standard 18-decimal values (strips trailing zeros)", () => {
    expect(formatTokenAmount("1500000000000000000", 18)).toBe("1.5");
  });

  it("uses exact BigInt exponent math for high decimals", () => {
    const raw = (BigInt(10) ** BigInt(24)).toString();
    expect(formatTokenAmount(raw, 24)).toBe("1");
  });

  it("adds thousands separators for large values", () => {
    // 5000 WETH
    const raw = (5000n * 10n ** 18n).toString();
    expect(formatTokenAmount(raw, 18)).toContain("5,000");
  });

  it("shows <0.0001 for dust amounts", () => {
    // 1 wei of WETH
    expect(formatTokenAmount("1", 18)).toBe("<0.0001");
  });

  it("formats zero as 0", () => {
    expect(formatTokenAmount("0", 18)).toBe("0");
  });

  it("formats 6-decimal tokens correctly", () => {
    // 1.5 USDC
    expect(formatTokenAmount("1500000", 6)).toBe("1.5");
  });
});
