import { describe, it, expect } from "vitest";
import { buildConsensusEnrichmentPlan } from "./consensus-enrichment";

describe("buildConsensusEnrichmentPlan", () => {
  it("attempts consensus enrichment on beacon networks", () => {
    expect(buildConsensusEnrichmentPlan(1)).toEqual({
      consensusMode: "beacon",
      shouldAttemptConsensusProof: true,
    });
  });

  it("attempts consensus enrichment on execution-envelope networks", () => {
    expect(buildConsensusEnrichmentPlan(10)).toEqual({
      consensusMode: "opstack",
      shouldAttemptConsensusProof: true,
    });
  });

  it("skips consensus enrichment when chain has no consensus mode", () => {
    expect(buildConsensusEnrichmentPlan(137)).toEqual({
      consensusMode: null,
      shouldAttemptConsensusProof: false,
    });
  });
});
