import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createEvidencePackage, VERIFICATION_SOURCE_IDS } from "@safelens/core";
import {
  COWSWAP_TWAP_TX,
  CHAIN_ID,
  TX_URL,
  EXPECTED_SAFE_TX_HASH,
} from "../../core/src/lib/safe/__tests__/fixtures/cowswap-twap-tx";

function cliPath() {
  return path.resolve(import.meta.dir, "cli.ts");
}

function runCli(args: string[], cwd = process.cwd()) {
  const result = spawnSync("bun", [cliPath(), ...args], {
    cwd,
    encoding: "utf-8",
  });

  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function readText(filePath: string) {
  return readFile(filePath, "utf-8");
}

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function pad32(addr: string): string {
  return "0x" + addr.replace("0x", "").padStart(64, "0");
}

function uint256Hex(n: bigint): string {
  return "0x" + n.toString(16).padStart(64, "0");
}

describe("CLI verify output", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "safelens-cli-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("prints stable JSON output with proposer, signatures, and warnings", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const evidencePath = path.join(tmpDir, "evidence.json");
    const settingsPath = path.join(tmpDir, "settings.json");

    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf-8");
    await writeFile(
      settingsPath,
      JSON.stringify(
        {
          version: "1.0",
          chains: {},
          addressRegistry: [],
        },
        null,
        2
      ),
      "utf-8"
    );

    const jsonResult = runCli(["verify", "--file", evidencePath, "--settings", settingsPath, "--format", "json"]);

    expect(jsonResult.code).toBe(0);
    const parsed = JSON.parse(jsonResult.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.safeTxHash).toBe(EXPECTED_SAFE_TX_HASH);
    expect(parsed.chainId).toBe(CHAIN_ID);
    expect(parsed.safeAddress).toBe(COWSWAP_TWAP_TX.safe);
    expect(parsed.signatures.summary.total).toBe(evidence.confirmations.length);
    expect(parsed.signatures.summary.valid).toBe(evidence.confirmations.length);
    expect(parsed.signatures.summary.invalid).toBe(0);
    expect(parsed.proposer).toBe(COWSWAP_TWAP_TX.confirmations[0].owner);
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toMatchObject({
      level: "danger",
      message: expect.stringContaining("DelegateCall to unknown contract"),
    });
    expect(parsed.sources).toHaveLength(10);
    expect(parsed.sources.map((item: { id: string }) => item.id)).toEqual([
      VERIFICATION_SOURCE_IDS.EVIDENCE_PACKAGE,
      VERIFICATION_SOURCE_IDS.HASH_RECOMPUTE,
      VERIFICATION_SOURCE_IDS.SIGNATURES,
      VERIFICATION_SOURCE_IDS.SIGNATURE_SCHEME_COVERAGE,
      VERIFICATION_SOURCE_IDS.SAFE_OWNERS_THRESHOLD,
      VERIFICATION_SOURCE_IDS.ONCHAIN_POLICY_PROOF,
      VERIFICATION_SOURCE_IDS.DECODED_CALLDATA,
      VERIFICATION_SOURCE_IDS.SIMULATION,
      VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF,
      VERIFICATION_SOURCE_IDS.SETTINGS,
    ]);
    expect(
      parsed.sources.find((item: { id: string }) => item.id === VERIFICATION_SOURCE_IDS.SETTINGS)?.status
    ).toBe("enabled");
  });

  it("returns full signature detail list and owner-indexed signature map in JSON output", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const evidencePath = path.join(tmpDir, "evidence.json");

    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf-8");

    const result = runCli(["verify", "--file", evidencePath, "--no-settings", "--format", "json"]);
    expect(result.code).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(Array.isArray(parsed.signatures.list)).toBe(true);
    expect(parsed.signatures.list).toHaveLength(evidence.confirmations.length);
    expect(parsed.signatures.byOwner).toBeTypeOf("object");
    expect(Array.isArray(parsed.signatures.byOwner)).toBe(false);

    const first = parsed.signatures.list[0];
    expect(first).toHaveProperty("owner");
    expect(first).toHaveProperty("result");
    expect(first.result).toMatchObject({
      status: "valid",
    });
    if (first.result.status === "valid") {
      expect(typeof first.result.recoveredSigner).toBe("string");
      expect(first.result.recoveredSigner.toLowerCase()).toBe(
        first.owner.toLowerCase()
      );
    }

    const mapped = parsed.signatures.byOwner[first.owner];
    expect(mapped).toEqual(first.result);
    for (const conf of evidence.confirmations) {
      expect(parsed.signatures.byOwner[conf.owner]).toMatchObject({
        status: "valid",
      });
    }
  });

  it("prints default settings warning text output when no settings override is provided", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const evidencePath = path.join(tmpDir, "evidence.json");

    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf-8");
    const result = runCli(["verify", "--file", evidencePath]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Evidence verified.");
    // Check for beginning of address (addresses may be truncated based on terminal width)
    expect(result.stdout).toContain(COWSWAP_TWAP_TX.safe.slice(0, 10).toLowerCase());
    // Check for beginning of hash (hashes may be truncated based on terminal width)
    expect(result.stdout).toContain(EXPECTED_SAFE_TX_HASH.slice(0, 10).toLowerCase());
    expect(result.stdout).toContain(String(CHAIN_ID));
    expect(result.stdout).toContain("Valid Signatures");
    expect(result.stdout).toContain("Warnings");
    expect(result.stdout).toContain("DelegateCall to unknown contract");
    // Sources of Truth section removed - not shown in app
  });

  it("suppresses warnings in text output with --no-settings", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const evidencePath = path.join(tmpDir, "evidence.json");

    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf-8");
    const result = runCli(["verify", "--file", evidencePath, "--no-settings"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Evidence verified.");
    expect(result.stdout).toContain("Valid Signatures");
    expect(result.stdout).not.toContain("Warnings");
  });

  it("prints disabled settings source when verification is run without settings", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const evidencePath = path.join(tmpDir, "evidence.json");

    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf-8");
    const result = runCli(["verify", "--file", evidencePath, "--no-settings", "--format", "json"]);

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const settingsSource = parsed.sources.find(
      (item: { id: string }) => item.id === VERIFICATION_SOURCE_IDS.SETTINGS
    );
    expect(settingsSource).toMatchObject({
      id: VERIFICATION_SOURCE_IDS.SETTINGS,
      status: "disabled",
    });
    expect(settingsSource?.trust).toBe("api-sourced");
  });

  it("reads evidence from stdin and emits JSON when requested", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const evidencePath = path.join(tmpDir, "evidence.json");
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf-8");
    const evidenceJson = await readText(evidencePath);

    const result = spawnSync("bun", [cliPath(), "verify", "--format", "json"], {
      cwd: process.cwd(),
      encoding: "utf-8",
      input: evidenceJson,
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.safeTxHash).toBe(EXPECTED_SAFE_TX_HASH);
  });

  it("prints warning lines in deterministic text format", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    const evidencePath = path.join(tmpDir, "evidence.json");

    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf-8");
    const result = runCli(["verify", "--file", evidencePath]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Warnings");
    expect(result.stdout).toContain("DelegateCall to unknown contract");
    expect(result.stdout).toContain("Signatures");
    expect(result.stdout).toContain("1");  // Valid signatures count
    // Sources of Truth section removed - not shown in app
  });

  it("shows basic simulation preview fields in text output", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    evidence.simulation = {
      success: true,
      returnData: "0x",
      gasUsed: "68000",
      logs: [],
      blockNumber: 19000000,
      blockTimestamp: "2026-02-20T16:07:40.000Z",
      trust: "rpc-sourced",
    };
    const evidencePath = path.join(tmpDir, "evidence-with-sim.json");

    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf-8");
    const result = runCli(["verify", "--file", evidencePath, "--no-settings"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Transaction Simulation");
    expect(result.stdout).toContain("Simulation status");
    expect(result.stdout).toContain("Simulation checks passed");
    expect(result.stdout).toContain("Gas used");
    expect(result.stdout).toContain("Block timestamp");
  });

  it("shows core execution safety fields and explicit transfer rows in text output", async () => {
    const evidence = createEvidencePackage(COWSWAP_TWAP_TX, CHAIN_ID, TX_URL);
    evidence.simulation = {
      success: true,
      returnData: "0x",
      gasUsed: "68000",
      logs: [
        {
          address: "0x6b175474e89094c44da98b954eedeac495271d0f",
          topics: [
            TRANSFER_TOPIC,
            pad32(evidence.safeAddress),
            pad32("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
          ],
          data: uint256Hex(250n * 10n ** 18n),
        },
      ],
      blockNumber: 19000000,
      blockTimestamp: "2026-02-20T16:07:40.000Z",
      trust: "rpc-sourced",
    };
    const evidencePath = path.join(tmpDir, "evidence-with-dai-sim.json");
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf-8");

    const result = runCli(["verify", "--file", evidencePath, "--no-settings"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Execution Safety");
    expect(result.stdout).toContain("Signatures");
    expect(result.stdout).toContain("Method");
    expect(result.stdout).toContain("Target");
    expect(result.stdout).toContain("Value (wei)");
    expect(result.stdout).toContain("Nonce");
    expect(result.stdout).toContain("Sent 1");
    expect(result.stdout).toContain("DAI");
  });

  it("prints sources documentation command", async () => {
    const result = runCli(["sources"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Generation sources reference:");
    expect(result.stdout).toContain("Safe Transaction Service response");
    expect(result.stdout).toContain("Verification sources reference:");
    expect(result.stdout).toContain("Evidence package integrity");
    expect(result.stdout).toContain("Safe owners and threshold");
    expect(result.stdout).toContain("Address and contract labels");
    expect(result.stdout).toContain("Verification sources without local settings:");
  });

  it("fails cleanly when input evidence JSON is malformed", async () => {
    const tmpFile = path.join(tmpDir, "bad.json");
    await writeFile(tmpFile, "{ bad json", "utf-8");

    const result = runCli(["verify", "--file", tmpFile]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Evidence package failed validation:");
    expect(result.stderr).toContain("Invalid JSON format");
  });

  it("documents the experimental Linea consensus analyze flag in help output", () => {
    const result = runCli([]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--enable-experimental-linea-consensus");
  });
});
