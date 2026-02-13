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
  interpretTransaction,
  computeSafeTxHashDetailed,
} from "@safelens/core";
import { createNodeSettingsStore, resolveSettingsPath } from "./storage";
import fs from "node:fs/promises";
import { getFlag, getPositionals, hasFlag } from "./args";
import {
  colors,
  heading,
  section,
  label,
  code,
  badge,
  trustBadge,
  bullet,
  box,
  table,
  divider,
} from "./formatter";
import { renderInterpretation } from "./interpretation-renderer";

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
    const trustLevel = source.trust === "self-verified"
      ? colors.green("✓ self-verified")
      : colors.yellow("⚠ api-sourced");

    const status = source.status === "enabled"
      ? colors.green("enabled")
      : colors.gray("disabled");

    console.log(bullet(`${trustLevel} ${colors.bold(source.title)} (${status})`));
    console.log(colors.dim("  " + source.summary));
    console.log(colors.dim("  " + source.detail));
    console.log("");
  }
}

function printWarningsSection(warnings: Array<{ level: string; message: string }>) {
  if (warnings.length === 0) return "";

  const lines: string[] = [];
  lines.push(section("⚠  Warnings"));

  for (const warning of warnings) {
    const levelBadge = warning.level === "critical"
      ? colors.bgRed(" CRITICAL ")
      : warning.level === "medium"
        ? colors.bgYellow(" MEDIUM ")
        : colors.bgBlue(" LOW ");

    lines.push(bullet(`${levelBadge} ${warning.message}`));
  }

  return lines.join("\n");
}

function printVerificationText(
  evidence: EvidencePackage,
  report: EvidenceVerificationReport,
  title: string
) {
  const { proposer, targetWarnings, signatures, sources, hashDetails } = report;
  const { summary } = signatures;

  console.log("\n" + heading(title));
  console.log("");

  // ── Transaction Interpretation ──────────────────────────────────────
  if (evidence.dataDecoded) {
    const interpretation = interpretTransaction(
      evidence.dataDecoded,
      evidence.transaction.to,
      evidence.transaction.operation
    );

    if (interpretation) {
      console.log(renderInterpretation(interpretation));
      console.log("");
    }
  }

  // ── Transaction Overview ────────────────────────────────────────────
  console.log(box(
    table([
      ["Chain", `${code(getChainName(evidence.chainId))} (${evidence.chainId}) ${trustBadge("self-verified")}`],
      ["Safe Address", `${code(evidence.safeAddress)} ${trustBadge("self-verified")}`],
      ["Safe URL", evidence.sources?.transactionUrl ? code(evidence.sources.transactionUrl) : label("N/A")],
    ], 15),
    "Transaction Overview"
  ));
  console.log("");

  // ── Hash Verification ───────────────────────────────────────────────
  console.log(section("🔐 Hash Verification"));
  console.log("");
  console.log(table([
    ["Safe TX Hash", `${code(evidence.safeTxHash)} ${trustBadge("self-verified")}`],
  ], 15));

  if (hashDetails) {
    console.log("");
    console.log(label("  Intermediate hashes for hardware wallet verification:"));
    console.log("");
    console.log(table([
      ["  Domain Separator", code(hashDetails.domainSeparator)],
      ["  Message Hash", code(hashDetails.messageHash)],
    ], 20));
    console.log(label("  " + colors.dim("Final hash = keccak256(0x1901 || domainSeparator || messageHash)")));
  }

  if (evidence.ethereumTxHash) {
    console.log("");
    console.log(table([
      ["Ethereum TX Hash", `${code(evidence.ethereumTxHash)} ${trustBadge("api-sourced")}`],
    ], 18));
  }
  console.log("");

  // ── Transaction Details ─────────────────────────────────────────────
  console.log(box(
    table([
      ["Target Contract", `${code(evidence.transaction.to)} ${trustBadge("self-verified")}`],
      ["Value", `${code(evidence.transaction.value)} wei ${trustBadge("self-verified")}`],
      ["Operation", `${code(evidence.transaction.operation === 0 ? "CALL" : "DELEGATECALL")} ${trustBadge("self-verified")}`],
      ["Nonce", `${code(String(evidence.transaction.nonce))} ${trustBadge("self-verified")}`],
    ], 18),
    "Transaction Details"
  ));
  console.log("");

  // ── Warnings ────────────────────────────────────────────────────────
  const warningsOutput = printWarningsSection(targetWarnings);
  if (warningsOutput) {
    console.log(warningsOutput);
    console.log("");
  }

  // ── Signatures ──────────────────────────────────────────────────────
  const signaturesTrustLevel = summary.unsupported > 0 ? "api-sourced" : "self-verified";

  console.log(section("✍️  Signatures") + " " + trustBadge(signaturesTrustLevel));
  console.log("");
  console.log(table([
    ["Valid Signatures", colors.green(String(summary.valid))],
    ["Invalid Signatures", summary.invalid > 0 ? colors.red(String(summary.invalid)) : colors.gray(String(summary.invalid))],
    ["Unsupported", summary.unsupported > 0 ? colors.yellow(String(summary.unsupported)) : colors.gray(String(summary.unsupported))],
    ["Total", colors.bold(String(summary.total))],
    ["Required", colors.bold(`${evidence.confirmations.length}/${evidence.confirmationsRequired}`)],
  ], 20));

  if (proposer) {
    console.log("");
    console.log(table([["Proposed by", code(proposer)]], 15));
  }
  console.log("");

  // ── Sources of Truth ────────────────────────────────────────────────
  console.log(section("📋 Sources of Truth"));
  console.log("");
  printSourceFactsFromList(sources);
  console.log("");
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
