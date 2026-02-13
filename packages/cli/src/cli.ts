#!/usr/bin/env node
import {
  parseSafeUrl,
  fetchSafeTransaction,
  createEvidencePackage,
  exportEvidencePackage,
  parseEvidencePackage,
  verifyEvidencePackage,
  loadSettingsConfig,
  DEFAULT_SETTINGS_CONFIG,
} from "@safelens/core";
import { createNodeSettingsStore, resolveSettingsPath } from "./storage";
import fs from "node:fs/promises";
import { getFlag, getPositionals, hasFlag } from "./args";

function printHelp() {
  console.log(`SafeLens CLI

Usage:
  safelens analyze <safe-url> [--out evidence.json] [--pretty]
  safelens verify [--file evidence.json] [--json <string>] [--settings <path>] [--no-settings] [--format json]
  safelens settings init [--path <file>]
  safelens settings show [--path <file>]

Examples:
  safelens analyze "https://app.safe.global/transactions/tx?safe=eth:0x...&id=multisig_..." --out evidence.json
  safelens verify --file evidence.json
  safelens settings init
`);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function runAnalyze(args: string[]) {
  const [url] = getPositionals(args);
  if (!url) {
    console.error("Missing Safe transaction URL.");
    process.exit(1);
  }

  const outPath = getFlag(args, "--out");
  const pretty = hasFlag(args, "--pretty") || !hasFlag(args, "--compact");

  const parsed = parseSafeUrl(url);
  const tx = await fetchSafeTransaction(parsed.chainId, parsed.safeTxHash);
  const evidence = createEvidencePackage(tx, parsed.chainId, url);
  const json = pretty ? exportEvidencePackage(evidence) : JSON.stringify(evidence);

  if (outPath) {
    await fs.writeFile(outPath, json, "utf-8");
    console.log(`Saved evidence to ${outPath}`);
    return;
  }

  console.log(json);
}

async function loadSettingsForVerify(args: string[]) {
  if (hasFlag(args, "--no-settings")) return null;
  const customPath = getFlag(args, "--settings") || getFlag(args, "--path");
  const store = createNodeSettingsStore(customPath);
  return await loadSettingsConfig(store, DEFAULT_SETTINGS_CONFIG);
}

async function runVerify(args: string[]) {
  let jsonInput = getFlag(args, "--json");
  const filePath = getFlag(args, "--file");

  if (!jsonInput && filePath) {
    jsonInput = await fs.readFile(filePath, "utf-8");
  }

  if (!jsonInput && !process.stdin.isTTY) {
    jsonInput = await readStdin();
  }

  if (!jsonInput) {
    console.error("Provide evidence JSON via --file, --json, or stdin.");
    process.exit(1);
  }

  const result = parseEvidencePackage(jsonInput);
  if (!result.valid || !result.evidence) {
    console.error("Evidence package failed validation:");
    result.errors.forEach((err) => console.error(`- ${err}`));
    process.exit(1);
  }

  const evidence = result.evidence;
  const settings = await loadSettingsForVerify(args);
  const report = await verifyEvidencePackage(evidence, { settings });
  const { signatures, proposer, targetWarnings } = report;
  const { summary } = signatures;
  const format = getFlag(args, "--format") || "text";

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          safeTxHash: evidence.safeTxHash,
          chainId: evidence.chainId,
          safeAddress: evidence.safeAddress,
          proposer,
          warnings: targetWarnings,
          signatures,
        },
        null,
        2
      )
    );
    return;
  }

  console.log("Evidence verified.");
  console.log(`Safe: ${evidence.safeAddress}`);
  console.log(`SafeTxHash: ${evidence.safeTxHash}`);
  console.log(`Chain: ${evidence.chainId}`);
  if (proposer) console.log(`Proposer: ${proposer}`);
  console.log(`Signatures: ${summary.valid}/${summary.total} valid (${summary.invalid} invalid, ${summary.unsupported} unsupported)`);
  if (targetWarnings.length > 0) {
    console.log("Warnings:");
    targetWarnings.forEach((warning) =>
      console.log(`- [${warning.level}] ${warning.message}`)
    );
  }
}

async function runSettings(args: string[]) {
  const sub = args[0];
  const pathFlag = getFlag(args, "--path");
  const store = createNodeSettingsStore(pathFlag);

  if (sub === "init") {
    await store.write(JSON.stringify(DEFAULT_SETTINGS_CONFIG, null, 2));
    console.log(`Settings written to ${resolveSettingsPath(pathFlag)}`);
    return;
  }

  if (sub === "show") {
    const json = await store.read();
    if (!json) {
      console.log("No settings found.");
      return;
    }
    console.log(json);
    return;
  }

  console.error("Unknown settings command. Use: settings init | settings show");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  try {
    if (command === "analyze") {
      await runAnalyze(args);
      return;
    }
    if (command === "verify") {
      await runVerify(args);
      return;
    }
    if (command === "settings") {
      await runSettings(args);
      return;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main();
