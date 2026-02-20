import { describe, it, expect } from "vitest";
import { verifySimulation } from "../verifier";
import type { Simulation } from "../../types";

function makeValidSimulation(overrides: Partial<Simulation> = {}): Simulation {
  return {
    success: true,
    returnData: "0x0000000000000000000000000000000000000000000000000000000000000001",
    gasUsed: "21000",
    logs: [],
    blockNumber: 19500000,
    trust: "rpc-sourced",
    ...overrides,
  };
}

describe("verifySimulation", () => {
  it("passes all checks for a valid successful simulation", () => {
    const result = verifySimulation(makeValidSimulation());
    expect(result.valid).toBe(true);
    expect(result.executionReverted).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.checks.length).toBeGreaterThanOrEqual(6);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("passes for a valid reverted simulation", () => {
    const result = verifySimulation(
      makeValidSimulation({ success: false, returnData: null, gasUsed: "0" })
    );
    expect(result.valid).toBe(true);
    expect(result.executionReverted).toBe(true);
    expect(result.errors).toEqual([]);
    // Structurally valid, but execution-result check reflects the revert
    const execCheck = result.checks.find((c) => c.id === "execution-result");
    expect(execCheck?.passed).toBe(false);
    expect(execCheck?.detail).toContain("reverted");
  });

  it("fails for invalid block number (0)", () => {
    const result = verifySimulation(makeValidSimulation({ blockNumber: 0 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("block number"))).toBe(true);
    const check = result.checks.find((c) => c.id === "block-number");
    expect(check?.passed).toBe(false);
  });

  it("fails for negative block number", () => {
    const result = verifySimulation(makeValidSimulation({ blockNumber: -1 }));
    expect(result.valid).toBe(false);
    const check = result.checks.find((c) => c.id === "block-number");
    expect(check?.passed).toBe(false);
  });

  it("fails for non-integer block number", () => {
    const result = verifySimulation(
      makeValidSimulation({ blockNumber: 123.5 })
    );
    expect(result.valid).toBe(false);
    const check = result.checks.find((c) => c.id === "block-number");
    expect(check?.passed).toBe(false);
  });

  it("fails for invalid gas value", () => {
    const result = verifySimulation(
      makeValidSimulation({ gasUsed: "not-a-number" })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("gasUsed"))).toBe(true);
    const check = result.checks.find((c) => c.id === "gas-used");
    expect(check?.passed).toBe(false);
  });

  it("passes for gas value of 0", () => {
    const result = verifySimulation(makeValidSimulation({ gasUsed: "0" }));
    expect(result.valid).toBe(true);
    const check = result.checks.find((c) => c.id === "gas-used");
    expect(check?.passed).toBe(true);
  });

  it("fails for invalid returnData hex", () => {
    const result = verifySimulation(
      makeValidSimulation({ returnData: "invalid-hex" as `0x${string}` })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("hex"))).toBe(true);
    const check = result.checks.find((c) => c.id === "return-data");
    expect(check?.passed).toBe(false);
  });

  it("passes for null returnData", () => {
    const result = verifySimulation(
      makeValidSimulation({ returnData: null })
    );
    expect(result.valid).toBe(true);
    const check = result.checks.find((c) => c.id === "return-data");
    expect(check?.passed).toBe(true);
    expect(check?.detail).toContain("null");
  });

  it("passes for empty 0x returnData", () => {
    const result = verifySimulation(
      makeValidSimulation({ returnData: "0x" as `0x${string}` })
    );
    expect(result.valid).toBe(true);
    const check = result.checks.find((c) => c.id === "return-data");
    expect(check?.passed).toBe(true);
  });

  it("validates log structure correctly", () => {
    const result = verifySimulation(
      makeValidSimulation({
        logs: [
          {
            address: "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
            topics: [
              "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
            ],
            data: "0xabcdef" as `0x${string}`,
          },
        ],
      })
    );
    expect(result.valid).toBe(true);
    const check = result.checks.find((c) => c.id === "logs");
    expect(check?.passed).toBe(true);
    expect(check?.detail).toBe("1 log(s)");
  });

  it("fails for logs with invalid address", () => {
    const result = verifySimulation(
      makeValidSimulation({
        logs: [
          {
            address: "0xshort" as `0x${string}`,
            topics: [],
            data: "0x" as `0x${string}`,
          },
        ],
      })
    );
    expect(result.valid).toBe(false);
    const check = result.checks.find((c) => c.id === "logs");
    expect(check?.passed).toBe(false);
  });

  it("fails for logs with invalid topic", () => {
    const result = verifySimulation(
      makeValidSimulation({
        logs: [
          {
            address: "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
            topics: ["0xshort" as `0x${string}`],
            data: "0x" as `0x${string}`,
          },
        ],
      })
    );
    expect(result.valid).toBe(false);
    const check = result.checks.find((c) => c.id === "logs");
    expect(check?.passed).toBe(false);
  });

  it("validates state diffs when present", () => {
    const result = verifySimulation(
      makeValidSimulation({
        stateDiffs: [
          {
            address: "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
            key: "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
            before: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
            after: "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
          },
        ],
      })
    );
    expect(result.valid).toBe(true);
    const check = result.checks.find((c) => c.id === "state-diffs");
    expect(check?.passed).toBe(true);
    expect(check?.detail).toBe("1 diff(s)");
  });

  it("fails for state diffs with invalid key", () => {
    const result = verifySimulation(
      makeValidSimulation({
        stateDiffs: [
          {
            address: "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
            key: "0xbad" as `0x${string}`,
            before: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
            after: "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
          },
        ],
      })
    );
    expect(result.valid).toBe(false);
    const check = result.checks.find((c) => c.id === "state-diffs");
    expect(check?.passed).toBe(false);
  });

  it("does not include state-diffs check when stateDiffs is undefined", () => {
    const result = verifySimulation(
      makeValidSimulation({ stateDiffs: undefined })
    );
    expect(result.valid).toBe(true);
    expect(result.checks.find((c) => c.id === "state-diffs")).toBeUndefined();
  });

  it("fails for missing trust classification", () => {
    const result = verifySimulation(
      makeValidSimulation({ trust: "" as "rpc-sourced" })
    );
    expect(result.valid).toBe(false);
    const check = result.checks.find((c) => c.id === "trust");
    expect(check?.passed).toBe(false);
  });

  it("reports execution result detail for success", () => {
    const result = verifySimulation(makeValidSimulation({ success: true }));
    const check = result.checks.find((c) => c.id === "execution-result");
    expect(check?.detail).toBe("Transaction succeeded");
  });

  it("reports execution result detail for revert", () => {
    const result = verifySimulation(makeValidSimulation({ success: false }));
    const check = result.checks.find((c) => c.id === "execution-result");
    expect(check?.detail).toBe("Transaction reverted");
  });

  it("collects multiple errors at once", () => {
    const result = verifySimulation(
      makeValidSimulation({
        blockNumber: 0,
        gasUsed: "bad",
        returnData: "no-hex" as `0x${string}`,
        trust: "" as "rpc-sourced",
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(4);
  });

  // ── Return data consistency cross-check (check 6b) ──────────────

  it("passes consistency check when success=true and returnData is execTransaction true", () => {
    const result = verifySimulation(
      makeValidSimulation({
        success: true,
        returnData:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
      })
    );
    expect(result.valid).toBe(true);
    // The consistency check should not even appear (short-circuit on match)
    const check = result.checks.find(
      (c) => c.id === "return-data-consistency"
    );
    expect(check).toBeUndefined();
  });

  it("skips consistency check when returnData is null", () => {
    const result = verifySimulation(
      makeValidSimulation({ success: true, returnData: null })
    );
    expect(result.valid).toBe(true);
    const check = result.checks.find(
      (c) => c.id === "return-data-consistency"
    );
    expect(check).toBeUndefined();
  });

  it("skips consistency check when success=false (revert case)", () => {
    const result = verifySimulation(
      makeValidSimulation({ success: false, returnData: "0x08c379a0" + "00".repeat(60) })
    );
    // success=false → the cross-check doesn't run (only checks success=true)
    const check = result.checks.find(
      (c) => c.id === "return-data-consistency"
    );
    expect(check).toBeUndefined();
  });

  it("skips consistency check for short returnData (< 66 chars)", () => {
    const result = verifySimulation(
      makeValidSimulation({ success: true, returnData: "0xabcdef" })
    );
    expect(result.valid).toBe(true);
    const check = result.checks.find(
      (c) => c.id === "return-data-consistency"
    );
    expect(check).toBeUndefined();
  });

  it("fails consistency check when success=true but returnData has revert selector", () => {
    // Error(string) selector = 0x08c379a0 followed by ABI-encoded revert reason
    const revertPayload =
      "0x08c379a0" +
      "0000000000000000000000000000000000000000000000000000000000000020" +
      "0000000000000000000000000000000000000000000000000000000000000005" +
      "6572726f72000000000000000000000000000000000000000000000000000000";
    const result = verifySimulation(
      makeValidSimulation({
        success: true,
        returnData: revertPayload as `0x${string}`,
      })
    );
    expect(result.valid).toBe(false);
    const check = result.checks.find(
      (c) => c.id === "return-data-consistency"
    );
    expect(check).toBeDefined();
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain("revert");
    expect(check?.detail).toContain("tampering");
    expect(
      result.errors.some((e) => e.includes("revert") && e.includes("tampering"))
    ).toBe(true);
  });

  it("fails consistency check when success=true but returnData encodes false", () => {
    // execTransaction returns abi.encode(false) = 32 bytes of zeros
    const falseBool =
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    const result = verifySimulation(
      makeValidSimulation({
        success: true,
        returnData: falseBool as `0x${string}`,
      })
    );
    expect(result.valid).toBe(false);
    const check = result.checks.find(
      (c) => c.id === "return-data-consistency"
    );
    expect(check).toBeDefined();
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain("false");
    expect(check?.detail).toContain("tampering");
  });

  it("passes consistency check when success=true and long returnData is not a revert", () => {
    // 66+ chars but doesn't start with revert selector — e.g. some custom return value
    const customReturn =
      "0x" +
      "0000000000000000000000000000000000000000000000000000000000000042" +
      "0000000000000000000000000000000000000000000000000000000000000001";
    const result = verifySimulation(
      makeValidSimulation({
        success: true,
        returnData: customReturn as `0x${string}`,
      })
    );
    expect(result.valid).toBe(true);
    const check = result.checks.find(
      (c) => c.id === "return-data-consistency"
    );
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
    expect(check?.detail).toContain("consistent");
  });
});
