/**
 * Interpretation UI registry.
 *
 * Maps each interpretation `id` to its card component and provides
 * severity-driven styling. TypeScript enforces that every id in the
 * Interpretation union has a renderer — adding a new protocol variant
 * without registering a component here is a compile error.
 *
 * To add a new protocol's card:
 *   1. Create a card component in this directory
 *   2. Add it to RENDERERS below
 */

import type { ComponentType } from "react";
import type { Interpretation, Severity } from "@safelens/core";
import { CowSwapTwapCard } from "./cowswap-twap-card";
import { SafePolicyCard } from "./safe-policy-card";
import { ERC7730Card } from "./erc7730-card";

// ── Evidence context ────────────────────────────────────────────────
// Optional ambient data from the evidence package. Renderers can use
// this for richer display (e.g. "changing threshold from X to Y").

export interface EvidenceContext {
  /** Current signing threshold (api-sourced). */
  currentThreshold?: number;
}

// ── Component registry ──────────────────────────────────────────────
// Record<Interpretation["id"], ...> ensures exhaustiveness: if a new
// variant is added to the union, TypeScript will error here until a
// renderer is provided.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RENDERERS: Record<Interpretation["id"], ComponentType<{ details: any; context?: EvidenceContext }>> = {
  "cowswap-twap": CowSwapTwapCard,
  "safe-policy": SafePolicyCard,
  "erc7730": ERC7730Card,
};

export function getRenderer(id: Interpretation["id"]): ComponentType<{ details: Interpretation["details"]; context?: EvidenceContext }> {
  return RENDERERS[id];
}

// ── Severity-driven styling ─────────────────────────────────────────
// The interpreter sets severity; the UI just looks it up. No per-protocol
// style logic needed — any future protocol gets correct styling from its
// severity alone.

export const SEVERITY_STYLES: Record<Severity, {
  card: string;
  protocolBadge: string;
  actionBadge: string;
}> = {
  info: {
    card: "border border-border/20 bg-surface/35",
    protocolBadge: "bg-surface-2/75 text-fg",
    actionBadge: "bg-accent/15 text-accent",
  },
  warning: {
    card: "border border-amber-500/30 bg-amber-500/[0.04]",
    protocolBadge: "bg-amber-500/15 text-amber-400",
    actionBadge: "bg-amber-500/10 text-amber-300",
  },
  critical: {
    card: "border border-red-500/30 bg-red-500/[0.04]",
    protocolBadge: "bg-red-500/15 text-red-400",
    actionBadge: "bg-red-500/10 text-red-300",
  },
};
