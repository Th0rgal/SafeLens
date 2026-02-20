import { describe, expect, it } from "bun:test";
import type { EvidencePackage, SimulationVerificationResult } from "@safelens/core";
import {
  buildSimulationDetailRows,
  SIMULATION_DETAIL_FIXED_ROW_IDS,
} from "../src/lib/simulation-details";

const SAFE = "0x1234567890abcdef1234567890abcdef12345678";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

function pad32(addr: string): string {
  return "0x" + addr.replace("0x", "").padStart(64, "0");
}

function uint256Hex(n: bigint): string {
  return "0x" + n.toString(16).padStart(64, "0");
}

function makeVerification(
  overrides: Partial<SimulationVerificationResult>
): SimulationVerificationResult {
  return {
    valid: true,
    executionReverted: false,
    checks: [],
    errors: [],
    ...overrides,
  };
}

describe("buildSimulationDetailRows", () => {
  it("shows unavailable status and reason when simulation is missing", () => {
    const rows = buildSimulationDetailRows(
      { chainId: 1, safeAddress: SAFE, simulation: undefined },
      undefined,
      "Simulation was skipped because no RPC URL was configured during package generation."
    );

    expect(rows).toEqual([
      { id: "simulation-status", label: "Simulation status", value: "Unavailable" },
      {
        id: "simulation-unavailable-reason",
        label: "Reason",
        value: "Simulation was skipped because no RPC URL was configured during package generation.",
      },
    ]);
  });

  it("summarizes decoded transfers and approvals for available simulation", () => {
    const maxUint = (1n << 256n) - 1n;
    const logs = [
      {
        address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        topics: [TRANSFER_TOPIC, pad32(SAFE), pad32("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")],
        data: uint256Hex(5000n * 10n ** 18n),
      },
      {
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        topics: [TRANSFER_TOPIC, pad32("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), pad32(SAFE)],
        data: uint256Hex(12000000n * 10n ** 6n),
      },
      {
        address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        topics: [APPROVAL_TOPIC, pad32(SAFE), pad32("0xcccccccccccccccccccccccccccccccccccccccc")],
        data: uint256Hex(maxUint),
      },
    ] as NonNullable<EvidencePackage["simulation"]>["logs"];

    const rows = buildSimulationDetailRows(
      {
        chainId: 1,
        safeAddress: SAFE,
        simulation: { logs } as EvidencePackage["simulation"],
      },
      makeVerification({
        checks: [
          { id: "s1", label: "Has logs", passed: true },
          { id: "s2", label: "No malformed logs", passed: true },
        ],
      }),
      "unavailable"
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        { id: "simulation-status", label: "Simulation status", value: "Executed successfully" },
        { id: "simulation-checks-passed", label: "Simulation checks passed", value: "2/2" },
        { id: "simulation-events-detected", label: "Token events", value: "3" },
        { id: "simulation-transfers", label: "Token transfers", value: "1 out, 1 in" },
        { id: "simulation-approvals", label: "Token approvals", value: "1 (1 unlimited)" },
      ])
    );
  });

  it("includes first verifier error when simulation verification fails", () => {
    const rows = buildSimulationDetailRows(
      {
        chainId: 1,
        safeAddress: SAFE,
        simulation: { logs: [] } as EvidencePackage["simulation"],
      },
      makeVerification({
        valid: false,
        checks: [{ id: "s1", label: "Has logs", passed: false }],
        errors: ["missing required call trace"],
      }),
      "unavailable"
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        { id: "simulation-status", label: "Simulation status", value: "Verification failed" },
        { id: "simulation-checks-passed", label: "Simulation checks passed", value: "0/1" },
        {
          id: "simulation-first-error",
          label: "Verifier error",
          value: "missing required call trace",
        },
      ])
    );
  });

  it("includes explicit transfer rows with token symbol when available", () => {
    const logs = [
      {
        address: "0x6b175474e89094c44da98b954eedeac495271d0f",
        topics: [TRANSFER_TOPIC, pad32(SAFE), pad32("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")],
        data: uint256Hex(250n * 10n ** 18n),
      },
    ] as NonNullable<EvidencePackage["simulation"]>["logs"];

    const rows = buildSimulationDetailRows(
      {
        chainId: 1,
        safeAddress: SAFE,
        simulation: { logs } as EvidencePackage["simulation"],
      },
      makeVerification({
        checks: [{ id: "s1", label: "Has logs", passed: true }],
      }),
      "unavailable"
    );

    const transferRow = rows.find((row) => row.id === "simulation-transfer-1");
    expect(transferRow).toBeDefined();
    expect(transferRow!.label).toContain("Sent");
    expect(transferRow!.value).toContain("DAI");
  });

  it("emits only supported simulation detail row ids", () => {
    const rows = buildSimulationDetailRows(
      {
        chainId: 1,
        safeAddress: SAFE,
        simulation: { logs: [] } as EvidencePackage["simulation"],
      },
      makeVerification({
        valid: false,
        checks: [{ id: "s1", label: "Has logs", passed: false }],
        errors: ["missing required call trace"],
      }),
      "Simulation was skipped because no RPC URL was configured during package generation."
    );

    const fixedIds = new Set<string>(SIMULATION_DETAIL_FIXED_ROW_IDS);
    for (const row of rows) {
      const isTransferId = /^simulation-transfer-\d+$/.test(row.id);
      expect(
        fixedIds.has(row.id) || isTransferId,
        `Unexpected simulation row id: ${row.id}`
      ).toBe(true);
    }
  });
});
