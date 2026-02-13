/**
 * CLI renderers for transaction interpretations
 * Matches the visual output of the Tauri app's InterpretationCard
 */

import type {
  Interpretation,
  CowSwapTwapDetails,
  SafePolicyChangeDetails,
  ERC7730Details,
} from "@safelens/core";
import {
  colors,
  badge,
  severityBadge,
  section,
  label,
  code,
  bullet,
  box,
  indent,
  formatAddress,
} from "./formatter";

export function renderInterpretation(interpretation: Interpretation): string {
  const header = renderHeader(interpretation);
  const body = renderDetails(interpretation);

  return box(header + "\n\n" + body, "Transaction Interpretation");
}

function renderHeader(interpretation: Interpretation): string {
  const protocolBadge = badge(interpretation.protocol, getBadgeVariant(interpretation.severity));
  const actionBadge = badge(interpretation.action, "info");
  const severity = severityBadge(interpretation.severity);

  return `${protocolBadge} ${actionBadge} ${severity}\n${colors.bold(interpretation.summary)}`;
}

function renderDetails(interpretation: Interpretation): string {
  switch (interpretation.id) {
    case "cowswap-twap":
      return renderCowSwapTwap(interpretation.details as CowSwapTwapDetails);
    case "safe-policy":
      return renderSafePolicy(interpretation.details as SafePolicyChangeDetails);
    case "erc7730":
      return renderERC7730(interpretation.details as ERC7730Details);
    default:
      return "";
  }
}

function renderCowSwapTwap(details: CowSwapTwapDetails): string {
  const lines: string[] = [];

  lines.push(section("Order Details"));
  lines.push(bullet(`Receiver: ${formatAddress(details.receiver)}`));
  lines.push(bullet(`Number of Parts: ${code(String(details.numberOfParts))}`));

  lines.push("");
  lines.push(section("Selling"));
  const sellToken = details.sellToken.symbol || details.sellToken.address.slice(0, 10);
  lines.push(bullet(`Token: ${code(sellToken)}`));
  lines.push(bullet(`Per Part: ${colors.cyan(details.partSellAmountFormatted)}`));
  lines.push(bullet(`Total: ${colors.cyan(details.totalSellAmountFormatted)}`));

  lines.push("");
  lines.push(section("Buying"));
  const buyToken = details.buyToken.symbol || details.buyToken.address.slice(0, 10);
  lines.push(bullet(`Token: ${code(buyToken)}`));
  lines.push(bullet(`Min Per Part: ${colors.cyan(details.minPartLimitFormatted)}`));

  lines.push("");
  lines.push(section("Timeframe"));
  if (details.startTime === 0) {
    lines.push(bullet(`Start: ${colors.gray("Immediate")}`));
  } else {
    lines.push(bullet(`Start: ${colors.gray(new Date(details.startTime * 1000).toISOString())}`));
  }
  lines.push(bullet(`Time Between Parts: ${code(details.timeBetweenPartsFormatted)}`));
  lines.push(bullet(`Total Duration: ${code(details.totalDurationFormatted)}`));
  lines.push(bullet(`Span: ${code(details.span === 0 ? "entire interval" : details.span + "s")}`));

  if (details.approval) {
    lines.push("");
    lines.push(section("Token Approval"));
    const approvalToken = details.approval.token.symbol || details.approval.token.address.slice(0, 10);
    lines.push(bullet(`Token: ${code(approvalToken)}`));
    lines.push(bullet(`Amount: ${colors.yellow(details.approval.amountFormatted)}`));
  }

  return lines.join("\n");
}

function renderSafePolicy(details: SafePolicyChangeDetails): string {
  const lines: string[] = [];

  lines.push(section("Policy Change"));
  lines.push(bullet(`Type: ${colors.bold(details.changeType)}`));
  lines.push(bullet(`Safe: ${formatAddress(details.safeAddress)}`));

  if (details.newOwner) {
    lines.push(bullet(`${colors.green("New Owner:")} ${formatAddress(details.newOwner)}`));
  }

  if (details.removedOwner) {
    lines.push(bullet(`${colors.red("Removed Owner:")} ${formatAddress(details.removedOwner)}`));
  }

  if (details.newThreshold !== undefined) {
    lines.push(bullet(`${colors.yellow("New Threshold:")} ${code(String(details.newThreshold))}`));
  }

  if (details.warnings && details.warnings.length > 0) {
    lines.push("");
    lines.push(section("⚠  Warnings"));
    for (const warning of details.warnings) {
      const levelBadge = warning.level === "critical"
        ? colors.bgRed(" CRITICAL ")
        : warning.level === "warning"
          ? colors.bgYellow(" WARNING ")
          : colors.bgBlue(" INFO ");

      lines.push(bullet(`${levelBadge} ${colors.bold(warning.title)}`));
      lines.push(indent(colors.dim(warning.description)));
    }
  }

  return lines.join("\n");
}

function renderERC7730(details: ERC7730Details): string {
  const lines: string[] = [];

  if (details.fields.length > 0) {
    lines.push(section("Transaction Fields"));
    for (const field of details.fields) {
      lines.push(bullet(`${label(field.label + ":")} ${code(field.value)}`));
    }
  }

  return lines.join("\n");
}

// ── Utilities ───────────────────────────────────────────────────────

function getBadgeVariant(severity: "info" | "warning" | "critical"): "info" | "warning" | "critical" {
  return severity;
}

function formatTokenAmount(amount: string, decimals: number): string {
  try {
    const num = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const wholePart = num / divisor;
    const fractionalPart = num % divisor;

    if (fractionalPart === 0n) {
      return wholePart.toString();
    }

    const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
    const trimmed = fractionalStr.replace(/0+$/, "");

    return `${wholePart}.${trimmed}`;
  } catch {
    return amount;
  }
}
