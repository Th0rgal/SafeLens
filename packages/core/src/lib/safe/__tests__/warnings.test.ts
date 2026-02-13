import { describe, it, expect } from "vitest";
import { analyzeTransaction, getHighestWarningLevel } from "../warnings";

describe("Safe Transaction Warnings", () => {
  describe("analyzeTransaction", () => {
    it("should detect DELEGATECALL operations as critical", () => {
      const warnings = analyzeTransaction({
        safeAddress: "0x1234567890123456789012345678901234567890",
        to: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
        value: 0n,
        data: "0x1234",
        operation: 1, // DelegateCall
      });

      // Should have at least the DELEGATECALL warning
      expect(warnings.length).toBeGreaterThan(0);
      const delegatecallWarning = warnings.find((w) => w.title === "DELEGATECALL Operation");
      expect(delegatecallWarning).toBeDefined();
      expect(delegatecallWarning!.level).toBe("critical");
      expect(delegatecallWarning!.description).toContain("executes code from another contract");
    });

    it("should detect Safe self-call policy changes as critical", () => {
      const safeAddress = "0x1234567890123456789012345678901234567890";
      const warnings = analyzeTransaction({
        safeAddress,
        to: safeAddress, // Self-call
        value: 0n,
        data: "0x1234",
        operation: 0,
        decodedMethod: "changeThreshold",
      });

      expect(warnings.some((w) => w.level === "critical")).toBe(true);
      expect(warnings.some((w) => w.title === "Safe Configuration Change")).toBe(true);
    });

    it("should warn about unknown contract interactions", () => {
      const warnings = analyzeTransaction({
        safeAddress: "0x1234567890123456789012345678901234567890",
        to: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12", // Unknown contract
        value: 0n,
        data: "0x1234", // Has calldata
        operation: 0,
      });

      expect(warnings.some((w) => w.level === "warning")).toBe(true);
      expect(warnings.some((w) => w.title === "Unknown Contract Interaction")).toBe(true);
    });

    it("should warn about large value transfers", () => {
      const largeValue = 10n ** 18n * 15n; // 15 ETH
      const warnings = analyzeTransaction({
        safeAddress: "0x1234567890123456789012345678901234567890",
        to: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
        value: largeValue,
        data: "0x",
        operation: 0,
      });

      expect(warnings.some((w) => w.level === "warning")).toBe(true);
      expect(warnings.some((w) => w.title === "Large Value Transfer")).toBe(true);
    });

    it("should provide info for known protocol interactions", () => {
      const warnings = analyzeTransaction({
        safeAddress: "0x1234567890123456789012345678901234567890",
        to: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", // Lido stETH
        value: 0n,
        data: "0x1234",
        operation: 0,
      });

      expect(warnings.some((w) => w.level === "info")).toBe(true);
      expect(warnings.some((w) => w.title.includes("Lido stETH"))).toBe(true);
    });

    it("should not warn for simple ETH transfers to unknown addresses", () => {
      const warnings = analyzeTransaction({
        safeAddress: "0x1234567890123456789012345678901234567890",
        to: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
        value: 10n ** 18n, // 1 ETH (below threshold)
        data: "0x", // No calldata
        operation: 0,
      });

      // Should not have unknown contract warning (no calldata)
      expect(warnings.some((w) => w.title === "Unknown Contract Interaction")).toBe(false);
    });

    it("should combine multiple warnings for complex transactions", () => {
      const safeAddress = "0x1234567890123456789012345678901234567890";
      const warnings = analyzeTransaction({
        safeAddress,
        to: safeAddress,
        value: 10n ** 18n * 15n, // 15 ETH
        data: "0x1234",
        operation: 1, // DelegateCall
        decodedMethod: "changeThreshold",
      });

      // Should have multiple warnings
      expect(warnings.length).toBeGreaterThan(1);
      expect(warnings.some((w) => w.level === "critical")).toBe(true);
    });
  });

  describe("getHighestWarningLevel", () => {
    it("should return critical if any warning is critical", () => {
      const warnings = [
        { level: "info" as const, title: "Info", description: "Info" },
        { level: "warning" as const, title: "Warning", description: "Warning" },
        { level: "critical" as const, title: "Critical", description: "Critical" },
      ];

      expect(getHighestWarningLevel(warnings)).toBe("critical");
    });

    it("should return warning if no critical warnings", () => {
      const warnings = [
        { level: "info" as const, title: "Info", description: "Info" },
        { level: "warning" as const, title: "Warning", description: "Warning" },
      ];

      expect(getHighestWarningLevel(warnings)).toBe("warning");
    });

    it("should return info for only info warnings", () => {
      const warnings = [
        { level: "info" as const, title: "Info 1", description: "Info" },
        { level: "info" as const, title: "Info 2", description: "Info" },
      ];

      expect(getHighestWarningLevel(warnings)).toBe("info");
    });

    it("should return info for empty warnings array", () => {
      expect(getHighestWarningLevel([])).toBe("info");
    });
  });
});
