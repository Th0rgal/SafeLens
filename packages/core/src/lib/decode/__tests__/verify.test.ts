import { describe, it, expect } from "vitest";
import { verifyCalldata } from "../verify";
import { normalizeCallSteps } from "../normalize";
import { COWSWAP_TWAP_TX } from "../../safe/__tests__/fixtures/cowswap-twap-tx";
import type { CallStep } from "../types";

/** Helper to get normalized steps from the fixture. */
function getFixtureSteps(): CallStep[] {
  return normalizeCallSteps(
    COWSWAP_TWAP_TX.dataDecoded,
    COWSWAP_TWAP_TX.to,
    COWSWAP_TWAP_TX.value,
    COWSWAP_TWAP_TX.operation,
    COWSWAP_TWAP_TX.data,
  );
}

describe("verifyCalldata", () => {
  describe("approve(address,uint256)", () => {
    it("verifies selector match", () => {
      const steps = getFixtureSteps();
      const result = verifyCalldata(steps[0]);
      expect(result.status).not.toBe("selector-mismatch");
    });

    it("verifies full param match", () => {
      const steps = getFixtureSteps();
      const result = verifyCalldata(steps[0]);
      expect(result).toEqual({ status: "verified" });
    });
  });

  describe("createWithContext((address,bytes32,bytes),address,bytes,bool)", () => {
    it("verifies selector match", () => {
      const steps = getFixtureSteps();
      const result = verifyCalldata(steps[1]);
      expect(result.status).not.toBe("selector-mismatch");
    });

    it("verifies full param match including tuple and bool", () => {
      const steps = getFixtureSteps();
      const result = verifyCalldata(steps[1]);
      expect(result).toEqual({ status: "verified" });
    });
  });

  describe("full pipeline", () => {
    it("verifies all steps from normalized multiSend", () => {
      const steps = getFixtureSteps();
      expect(steps.length).toBe(2);
      for (const step of steps) {
        expect(verifyCalldata(step)).toEqual({ status: "verified" });
      }
    });
  });

  describe("edge cases", () => {
    it("returns no-data for empty rawData", () => {
      const step: CallStep = {
        index: 0,
        to: "0x0000000000000000000000000000000000000000",
        value: "0",
        operation: 0,
        method: "approve",
        params: [],
        rawData: "",
      };
      expect(verifyCalldata(step)).toEqual({ status: "no-data" });
    });

    it("returns no-data for 0x rawData", () => {
      const step: CallStep = {
        index: 0,
        to: "0x0000000000000000000000000000000000000000",
        value: "0",
        operation: 0,
        method: "approve",
        params: [],
        rawData: "0x",
      };
      expect(verifyCalldata(step)).toEqual({ status: "no-data" });
    });

    it("returns no-data when method is null", () => {
      const step: CallStep = {
        index: 0,
        to: "0x0000000000000000000000000000000000000000",
        value: "0",
        operation: 0,
        method: null,
        params: [],
        rawData: "0x095ea7b3000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
      };
      expect(verifyCalldata(step)).toEqual({ status: "no-data" });
    });

    it("detects tampered selector", () => {
      const steps = getFixtureSteps();
      const tampered: CallStep = {
        ...steps[0],
        rawData: "0xdeadbeef" + steps[0].rawData.slice(10),
      };
      expect(verifyCalldata(tampered)).toEqual({
        status: "selector-mismatch",
      });
    });

    it("detects tampered param value", () => {
      const steps = getFixtureSteps();
      const tampered: CallStep = {
        ...steps[0],
        params: [
          steps[0].params[0],
          { name: "wad", type: "uint256", value: "9999" },
        ],
      };
      expect(verifyCalldata(tampered)).toEqual({
        status: "params-mismatch",
      });
    });
  });
});
