import { describe, expect, it } from "vitest";
import { formatTokenAmount } from "../token-utils";

describe("formatTokenAmount", () => {
  it("formats standard 18-decimal values", () => {
    expect(formatTokenAmount("1500000000000000000", 18)).toBe("1.5000");
  });

  it("uses exact BigInt exponent math for high decimals", () => {
    const raw = (BigInt(10) ** BigInt(24)).toString();
    expect(formatTokenAmount(raw, 24)).toBe("1.0000");
  });
});
