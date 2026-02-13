#!/usr/bin/env node
import {
  type EvidencePackage,
  type EvidenceVerificationReport,
  parseSafeUrl,
  fetchSafeTransaction,
  createEvidencePackage,
  exportEvidencePackage,
  parseEvidencePackage,
  verifyEvidencePackage,
  loadSettingsConfig,
  DEFAULT_SETTINGS_CONFIG,
  buildGenerationSources,
  buildVerificationSources,
  getChainName,
} from "@safelens/core";
import { createNodeSettingsStore, resolveSettingsPath } from "./storage";
import fs from "node:fs/promises";
import { getFlag, getPositionals, hasFlag } from "./args";

type OutputFormat = "text" | "json";

const VALID_FORMATS = new Set<OutputFormat>(["text", "json"]);

function printHelp() {
  console.log(`SafeLens CLI

Usage:
  safelens analyze <safe-url> [--out evidence.json] [--pretty] [--format text|json] [--settings <path>] [--no-settings]
  safelens verify [--file evidence.json] [--json <string>] [--settings <path>] [--no-settings] [--format text|json]
  safelens sources
  safelens settings init [--path <file>]
  safelens settings show [--path <file>]

Examples:
  safelens analyze "https://app.safe.global/transactions/tx?safe=eth:0x...&id=multisig_..." --out evidence.json
  safelens analyze "https://app.safe.global/transactions/tx?safe=eth:0x...&id=multisig_..." --format json
  safelens analyze "https://app.safe.global/transactions/tx?safe=eth:0x...&id=multisig_..." --no-settings
  safelens verify --file evidence.json
  safelens sources
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

function getOutputFormat(args: string[], defaultFormat: OutputFormat): OutputFormat {
  const value = getFlag(args, "--format")?.toLowerCase();
  if (!value) return defaultFormat;
  if (!VALID_FORMATS.has(value as OutputFormat)) {
    console.error(`Unknown --format value "${value}". Supported values: text, json.`);
    process.exit(1);
  }
  return value as OutputFormat;
}

function createVerifyPayload(
  evidence: EvidencePackage,
  report: EvidenceVerificationReport
) {
  return {
    ok: true,
    safeTxHash: evidence.safeTxHash,
    chainId: evidence.chainId,
    safeAddress: evidence.safeAddress,
    proposer: report.proposer,
    warnings: report.targetWarnings,
    signatures: report.signatures,
    sources: report.sources,
  };
}

function printSourceFactsFromList(sources: ReturnType<typeof buildVerificationSources>) {
  for (const source of sources) {
    const status = source.status === "enabled" ? "enabled" : "disabled";
    console.log(`- [${source.trust}] ${source.title} (${status})`);
    console.log(`  ${source.summary}`);
    console.log(`  ${source.detail}`);
  }
}

function printWarningsSection(warnings: Array<{ level: string; message: string }>) {
  if (warnings.length === 0) return;
  console.log("Warnings:");
  warnings.forEach((warning) => {
    console.log(`- [${warning.level}] ${warning.message}`);
  });
}

function printVerificationText(
  evidence: EvidencePackage,
  report: EvidenceVerificationReport,
  heading: string
) {
  const { proposer, targetWarnings, signatures, sources } = report;
  const { summary } = signatures;

  console.log(heading);
  console.log(`Safe: ${evidence.safeAddress}`);
  console.log(`Chain: ${evidence.chainId}`);
  console.log(`Chain name: ${getChainName(evidence.chainId)}`);
  console.log(`SafeTxHash: ${evidence.safeTxHash}`);
  if (evidence.ethereumTxHash) console.log(`Ethereum Tx Hash: ${evidence.ethereumTxHash}`);
  if (evidence.sources?.transactionUrl) console.log(`Safe URL: ${evidence.sources.transactionUrl}`);
  if (proposer) console.log(`Proposed by: ${proposer}`);
  console.log(`Signatures: ${summary.valid}/${summary.total} valid (${summary.invalid} invalid, ${summary.unsupported} unsupported)`);
  console.log(`Required signatures: ${evidence.confirmations.length}/${evidence.confirmationsRequired}`);
  printWarningsSection(targetWarnings);
  console.log("Sources of truth:");
  printSourceFactsFromList(sources);
}

async function runAnalyze(args: string[]) {
  const [url] = getPositionals(args);
  if (!url) {
    console.error("Missing Safe transaction URL.");
    process.exit(1);
  }

  const outPath = getFlag(args, "--out");
  const pretty = hasFlag(args, "--pretty") || !hasFlag(args, "--compact");
  const format = getOutputFormat(args, "text");

  const parsed = parseSafeUrl(url);
  const tx = await fetchSafeTransaction(parsed.chainId, parsed.safeTxHash);
  const evidence = createEvidencePackage(tx, parsed.chainId, url);
  const settings = await loadSettingsForVerify(args);
  const report = await verifyEvidencePackage(evidence, { settings });
  const json = pretty ? exportEvidencePackage(evidence) : JSON.stringify(evidence);

  if (outPath) {
    await fs.writeFile(outPath, json, "utf-8");
    console.log(`Saved evidence to ${outPath}`);
  }

  if (format === "json") {
    console.log(
          JSON.stringify(
          {
            evidence,
          ...createVerifyPayload(evidence, report),
          },
        null,
        pretty ? 2 : 0
      )
    );
    return;
  }

  printVerificationText(evidence, report, "Analysis complete.");
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
  const format = getOutputFormat(args, "text");

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

  if (format === "json") {
    console.log(
      JSON.stringify(
        createVerifyPayload(evidence, report),
        null,
        2
      )
    );
    return;
  }

  printVerificationText(evidence, report, "Evidence verified.");
}

async function runSources() {
  console.log("Generation sources reference:");
  printSourceFactsFromList(buildGenerationSources());
  console.log("");
  console.log("Verification sources reference:");
  printSourceFactsFromList(
    buildVerificationSources({
      hasSettings: true,
      hasUnsupportedSignatures: false,
      hasDecodedData: true,
    })
  );
  console.log("");
  console.log("Verification sources without local settings:");
  printSourceFactsFromList(
    buildVerificationSources({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: true,
    })
  );
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
    if (command === "sources") {
      await runSources();
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
