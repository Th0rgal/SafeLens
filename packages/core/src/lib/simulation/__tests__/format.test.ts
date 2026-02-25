import { describe, it, expect } from "vitest";
import { formatTokenAmount } from "../format";

describe("formatTokenAmount", () => {
  describe("known decimals", () => {
    it("formats zero", () => {
      expect(formatTokenAmount(0n, 18, "WETH")).toBe("0 WETH");
      expect(formatTokenAmount(0n, 6, null)).toBe("0");
    });

    it("formats whole amounts with thousands separators", () => {
      expect(formatTokenAmount(5000n * 10n ** 18n, 18, "WETH")).toContain("5,000");
      expect(formatTokenAmount(5000n * 10n ** 18n, 18, "WETH")).toContain("WETH");
    });

    it("formats fractional amounts up to 4 decimals", () => {
      // 1.5 USDC = 1_500_000 raw (6 decimals)
      expect(formatTokenAmount(1_500_000n, 6, "USDC")).toBe("1.5 USDC");
    });

    it("strips trailing fractional zeros", () => {
      // 2.10 DAI → should show 2.1, not 2.10 or 2.1000
      expect(formatTokenAmount(2_100_000_000_000_000_000n, 18, "DAI")).toBe("2.1 DAI");
    });

    it("shows <0.0001 for dust amounts", () => {
      // 1 wei of WETH = too small for 4 decimal places
      expect(formatTokenAmount(1n, 18, "WETH")).toBe("<0.0001 WETH");
      // 100 wei (still under 0.0001 WETH = 10^14 wei)
      expect(formatTokenAmount(100n, 18, null)).toBe("<0.0001");
    });

    it("formats large amounts correctly", () => {
      // 1,234,567.89 DAI
      const raw = 1_234_567_890_000_000_000_000_000n;
      const result = formatTokenAmount(raw, 18, "DAI");
      expect(result).toContain("1,234,567");
      expect(result).toContain("DAI");
    });

    it("works without a symbol", () => {
      expect(formatTokenAmount(1_000_000n, 6, null)).toBe("1");
      expect(formatTokenAmount(1_500_000n, 6, null)).toBe("1.5");
    });

    it("truncates to 4 decimal places (no rounding)", () => {
      // 1.123456789 with 9 decimals → show 1.1234
      expect(formatTokenAmount(1_123_456_789n, 9, "TOK")).toBe("1.1234 TOK");
    });
  });

  describe("null decimals (unknown token)", () => {
    it("returns raw bigint as string", () => {
      expect(formatTokenAmount(12345n, null, null)).toBe("12345");
    });

    it("appends symbol when available", () => {
      expect(formatTokenAmount(42n, null, "???")).toBe("42 ???");
    });

    it("handles zero with null decimals", () => {
      expect(formatTokenAmount(0n, null, "X")).toBe("0 X");
    });
  });
});
