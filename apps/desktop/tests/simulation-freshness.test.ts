import { describe, expect, it } from "bun:test";
import { buildSimulationFreshnessDetail } from "../src/lib/simulation-freshness";

describe("buildSimulationFreshnessDetail", () => {
  const NOW_MS = Date.parse("2026-02-20T14:00:00.000Z");

  it("includes block timestamp age against local time when available", () => {
    const detail = buildSimulationFreshnessDetail(
      {
        blockNumber: 12345,
        blockTimestamp: "2026-02-20T13:55:00.000Z",
      },
      "2026-02-20T13:58:00.000Z",
      NOW_MS
    );

    expect(detail).toContain("Simulated at block 12345");
    expect(detail).toContain("block time 2026-02-20T13:55:00.000Z (5 minutes ago)");
    expect(detail).toContain("package created 2 minutes ago");
  });

  it("falls back to explicit unavailable text when block timestamp is missing", () => {
    const detail = buildSimulationFreshnessDetail(
      {
        blockNumber: 777,
      },
      "2026-02-20T13:58:00.000Z",
      NOW_MS
    );

    expect(detail).toContain("Simulated at block 777");
    expect(detail).toContain("block time unavailable");
  });
});
