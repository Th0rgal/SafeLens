import type { EvidencePackage } from "@safelens/core";

type SimulationSummary = Pick<NonNullable<EvidencePackage["simulation"]>, "blockNumber" | "blockTimestamp">;

export function formatRelativeTime(timestamp: string, nowMs = Date.now()): string | null {
  const parsed = new Date(timestamp);
  const ms = parsed.getTime();
  if (Number.isNaN(ms)) return null;

  const diffMinutes = Math.max(0, Math.floor((nowMs - ms) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes === 1) return "1 minute ago";
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
}

export function buildSimulationFreshnessDetail(
  simulation: SimulationSummary | null | undefined,
  packagedAt: string,
  nowMs = Date.now()
): string {
  if (!simulation) {
    return "Simulation not performed for this package.";
  }

  const packageAge = formatRelativeTime(packagedAt, nowMs) ?? "at an unknown time";
  const blockAge = simulation.blockTimestamp
    ? formatRelativeTime(simulation.blockTimestamp, nowMs) ?? "at an unknown time"
    : null;

  if (!simulation.blockTimestamp || !blockAge) {
    return `Simulated at block ${simulation.blockNumber} • block time unavailable • package created ${packageAge}`;
  }

  return `Simulated at block ${simulation.blockNumber} • block time ${simulation.blockTimestamp} (${blockAge}) • package created ${packageAge}`;
}
