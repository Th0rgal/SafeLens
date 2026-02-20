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

  it("shows unavailable-in-session status when proof exists but verifier result is absent", () => {
    const rows = buildConsensusDetailRows(
      { consensusProof: { consensusMode: "beacon" } as EvidencePackage["consensusProof"] },
      undefined
    );

    expect(rows).toEqual([
      { id: "consensus-mode", label: "Consensus mode", value: "Beacon" },
      {
        id: "consensus-status",
        label: "Verification status",
        value: "Unavailable in this session",
      },
    ]);
  });

  it("includes non-equivalence assurance row for OP Stack mode", () => {
    const rows = buildConsensusDetailRows(
      { consensusProof: { consensusMode: "opstack" } as EvidencePackage["consensusProof"] },
      makeVerification({})
    );

    expect(rows.find((row) => row.id === "consensus-assurance")?.value).toBe(
      "OP Stack consensus checks are not equivalent to Beacon light-client finality."
    );
  });

  it("includes non-equivalence assurance row for Linea mode", () => {
    const rows = buildConsensusDetailRows(
      { consensusProof: { consensusMode: "linea" } as EvidencePackage["consensusProof"] },
      makeVerification({})
    );

    expect(rows.find((row) => row.id === "consensus-assurance")?.value).toBe(
      "Linea consensus checks are not equivalent to Beacon light-client finality."
    );
  });

  it("does not include non-equivalence assurance row for Beacon mode", () => {
    const rows = buildConsensusDetailRows(
      { consensusProof: { consensusMode: "beacon" } as EvidencePackage["consensusProof"] },
      makeVerification({})
    );

    expect(rows.find((row) => row.id === "consensus-assurance")).toBeUndefined();
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
      "consensus-assurance",
      "consensus-finalized-block",
      "consensus-state-root",
    ]);
    expect(rows.find((row) => row.id === "consensus-state-root")?.monospace).toBe(true);
  });

  it("uses envelope labels for unverified OP Stack consensus rows", () => {
    const rows = buildConsensusDetailRows(
      { consensusProof: { consensusMode: "opstack" } as EvidencePackage["consensusProof"] },
      makeVerification({
        valid: false,
        error_code: "opstack-consensus-verifier-pending",
        verified_block_number: 123,
        verified_state_root: `0x${"a".repeat(64)}`,
      })
    );

    expect(rows.find((row) => row.id === "consensus-finalized-block")?.label).toBe(
      "Envelope block"
    );
    expect(rows.find((row) => row.id === "consensus-state-root")?.label).toBe(
      "Envelope state root"
    );
  });

  it("keeps verified wording for successful beacon consensus rows", () => {
    const rows = buildConsensusDetailRows(
      { consensusProof: { consensusMode: "beacon" } as EvidencePackage["consensusProof"] },
      makeVerification({
        valid: true,
        verified_block_number: 123,
        verified_state_root: `0x${"b".repeat(64)}`,
      })
    );

    expect(rows.find((row) => row.id === "consensus-finalized-block")?.label).toBe(
      "Finalized block"
    );
    expect(rows.find((row) => row.id === "consensus-state-root")?.label).toBe(
      "Verified state root"
    );
  });

  it("treats missing consensus mode as beacon for legacy packages", () => {
    const rows = buildConsensusDetailRows(
      { consensusProof: {} as EvidencePackage["consensusProof"] },
      makeVerification({
        valid: false,
        verified_block_number: 123,
        verified_state_root: `0x${"b".repeat(64)}`,
      })
    );

    expect(rows.find((row) => row.id === "consensus-mode")?.value).toBe("Beacon");
    expect(rows.find((row) => row.id === "consensus-finalized-block")?.label).toBe(
      "Finalized block"
    );
    expect(rows.find((row) => row.id === "consensus-state-root")?.label).toBe(
      "Verified state root"
    );
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
