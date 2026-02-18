#!/usr/bin/env node
import {
  type EvidencePackage,
  type EvidenceVerificationReport,
  type SettingsConfig,
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
  resolveAddress,
  setGlobalDescriptors,
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
  formatAddress,
  formatUrl,
  legend,
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

/**
 * Format an address with name resolution from address book
 * Known addresses show their name in bold green
 * Unknown addresses show full address in orange
 */
function formatAddressWithName(address: string, settings: SettingsConfig | null): string {
  if (settings) {
    const name = resolveAddress(address, settings);
    if (name) {
      return colors.bold(colors.green(name));
    }
  }
  // Orange color for unknown addresses (using yellow + red mix approximation)
  return `\x1b[38;5;214m${address}\x1b[0m`; // Orange color (256-color mode)
}

function printWarningsSection(warnings: Array<{ level: string; message: string }>) {
  if (warnings.length === 0) return "";

  const warningLines: string[] = [];

  for (const warning of warnings) {
    const levelBadge = warning.level === "critical"
      ? colors.bgRed(" CRITICAL ")
      : warning.level === "medium"
        ? colors.bgYellow(" MEDIUM ")
        : colors.bgBlue(" LOW ");

    warningLines.push(bullet(`${levelBadge} ${warning.message}`));
  }

  return box(warningLines.join("\n"), "⚠  Warnings");
}

function printVerificationText(
  evidence: EvidencePackage,
  report: EvidenceVerificationReport,
  title: string,
  settings: SettingsConfig | null = null
) {
  const { proposer, targetWarnings, signatures, hashDetails } = report;
  const { summary } = signatures;

  console.log("\n" + heading(title));
  console.log(legend());

  // ── Transaction Interpretation ──────────────────────────────────────
  if (evidence.dataDecoded) {
    const interpretation = interpretTransaction(
      evidence.dataDecoded,
      evidence.transaction.to,
      evidence.transaction.operation,
      settings?.disabledInterpreters ?? [],
      evidence.transaction.data,
      evidence.chainId,
      evidence.transaction.value,
      evidence.safeAddress,
    );

    if (interpretation) {
      console.log("");
      console.log(renderInterpretation(interpretation));
    }
  }

  // ── Transaction Overview ────────────────────────────────────────────
  console.log("");
  console.log(box(
    table([
      ["Chain", `${code(getChainName(evidence.chainId))} (${evidence.chainId}) ${trustBadge("self-verified")}`],
      ["Safe Address", `${formatAddressWithName(evidence.safeAddress, settings)} ${trustBadge("self-verified")}`],
      ["Safe URL", evidence.sources?.transactionUrl ? formatUrl(evidence.sources.transactionUrl) : label("N/A")],
    ], 15),
    "Transaction Overview"
  ));

  // ── Hash Verification ───────────────────────────────────────────────
  console.log("");
  console.log(box(
    (() => {
      const rows: Array<[string, string]> = [
        ["Safe TX Hash", `${formatAddress(evidence.safeTxHash)} ${trustBadge("self-verified")}`],
      ];

      if (hashDetails) {
        rows.push(
          ["Domain Separator", `${formatAddress(hashDetails.domainSeparator)} ${colors.dim("(hw wallet)")}`],
          ["Message Hash", `${formatAddress(hashDetails.messageHash)} ${colors.dim("(hw wallet)")}`]
        );
      }

      if (evidence.ethereumTxHash) {
        rows.push(
          ["Ethereum TX Hash", `${formatAddress(evidence.ethereumTxHash)} ${trustBadge("api-sourced")}`]
        );
      }

      return table(rows, 18);
    })(),
    "🔐 Hash Verification"
  ));

  // ── Transaction Details ─────────────────────────────────────────────
  console.log("");
  console.log(box(
    table([
      ["Target Contract", `${formatAddressWithName(evidence.transaction.to, settings)} ${trustBadge("self-verified")}`],
      ["Value", `${code(evidence.transaction.value)} wei ${trustBadge("self-verified")}`],
      ["Operation", `${code(evidence.transaction.operation === 0 ? "CALL" : "DELEGATECALL")} ${trustBadge("self-verified")}`],
      ["Nonce", `${code(String(evidence.transaction.nonce))} ${trustBadge("self-verified")}`],
    ], 18),
    "Transaction Details"
  ));

  // ── Warnings ────────────────────────────────────────────────────────
  const warningsOutput = printWarningsSection(targetWarnings);
  if (warningsOutput) {
    console.log("");
    console.log(warningsOutput);
  }

  // ── Signatures ──────────────────────────────────────────────────────
  const signaturesTrustLevel = summary.unsupported > 0 ? "api-sourced" : "self-verified";

  console.log("");
  const signaturesRows: Array<[string, string]> = [
    ["Valid Signatures", colors.green(String(summary.valid))],
    ["Invalid Signatures", summary.invalid > 0 ? colors.red(String(summary.invalid)) : colors.gray(String(summary.invalid))],
    ["Unsupported", summary.unsupported > 0 ? colors.yellow(String(summary.unsupported)) : colors.gray(String(summary.unsupported))],
    ["Total", colors.bold(String(summary.total))],
    ["Required", colors.bold(`${evidence.confirmations.length}/${evidence.confirmationsRequired}`)],
  ];

  if (proposer) {
    signaturesRows.push(["Proposed by", formatAddressWithName(proposer, settings)]);
  }

  console.log(box(
    table(signaturesRows, 18),
    "✍️  Signatures " + trustBadge(signaturesTrustLevel)
  ));

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

  printVerificationText(evidence, report, "Analysis complete.", settings);
}

async function loadSettingsForVerify(args: string[]) {
  if (hasFlag(args, "--no-settings")) return null;
  const customPath = getFlag(args, "--settings") || getFlag(args, "--path");
  const store = createNodeSettingsStore(customPath);
  const config = await loadSettingsConfig(store, DEFAULT_SETTINGS_CONFIG);
  setGlobalDescriptors(config.erc7730Descriptors ?? []);
  return config;
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

  printVerificationText(evidence, report, "Evidence verified.", settings);
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
