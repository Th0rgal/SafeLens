import { describe, expect, it } from "bun:test";
import type { ConsensusVerificationResult, EvidencePackage } from "@safelens/core";
import { buildConsensusDetailRows } from "../src/lib/consensus-details";

function makeVerification(
  overrides: Partial<ConsensusVerificationResult>
): ConsensusVerificationResult {
  return {
    valid: true,
    verified_state_root: null,
    verified_block_number: null,
    state_root_matches: true,
    sync_committee_participants: 0,
    error: null,
    error_code: null,
    checks: [],
    ...overrides,
  };
}

describe("buildConsensusDetailRows", () => {
  it("returns no rows when package has no consensus proof", () => {
    const rows = buildConsensusDetailRows({} as EvidencePackage, undefined);
    expect(rows).toEqual([]);
  });

  it("shows running status when proof exists but verifier result is pending", () => {
    const rows = buildConsensusDetailRows(
      { consensusProof: { consensusMode: "beacon" } as EvidencePackage["consensusProof"] },
      undefined
    );

    expect(rows).toEqual([
      { id: "consensus-mode", label: "Consensus mode", value: "Beacon" },
      { id: "consensus-status", label: "Verification status", value: "Running" },
    ]);
  });

  it("includes finalized block and state root rows when available", () => {
    const rows = buildConsensusDetailRows(
      { consensusProof: { consensusMode: "opstack" } as EvidencePackage["consensusProof"] },
      makeVerification({
        verified_block_number: 123,
        verified_state_root: `0x${"a".repeat(64)}`,
      })
    );

    expect(rows.map((row) => row.id)).toEqual([
      "consensus-mode",
      "consensus-finalized-block",
      "consensus-state-root",
    ]);
    expect(rows[2]?.monospace).toBe(true);
  });

  it("includes participant count only for beacon mode", () => {
    const rows = buildConsensusDetailRows(
      { consensusProof: { consensusMode: "beacon" } as EvidencePackage["consensusProof"] },
      makeVerification({ sync_committee_participants: 491 })
    );

    expect(rows.map((row) => row.id)).toContain("consensus-participants");
    expect(rows.find((row) => row.id === "consensus-participants")?.value).toBe("491/512");
  });
});
