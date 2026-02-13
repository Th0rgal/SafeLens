"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interpretTransaction } from "@safelens/core";
import type { CowSwapTwapDetails, SafePolicyChangeDetails } from "@safelens/core";
import { CowSwapTwapCard } from "@/components/interpretations/cowswap-twap-card";
import { SafePolicyCard } from "@/components/interpretations/safe-policy-card";
import { GenericDetailsCard } from "@/components/interpretations/generic-details-card";

interface InterpretationCardProps {
  dataDecoded: unknown;
  txTo: string;
  txOperation: number;
}

export function InterpretationCard({
  dataDecoded,
  txTo,
  txOperation,
}: InterpretationCardProps) {
  const interpretation = useMemo(
    () => interpretTransaction(dataDecoded, txTo, txOperation),
    [dataDecoded, txTo, txOperation]
  );

  if (!interpretation) return null;

  const isCritical = interpretation.protocol === "Safe" && interpretation.action === "Policy Change";

  return (
    <Card className={isCritical
      ? "border border-red-500/30 bg-red-500/[0.04]"
      : "border border-border/20 bg-surface/35"
    }>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
            isCritical ? "bg-red-500/15 text-red-400" : "bg-surface-2/75 text-fg"
          }`}>
            {interpretation.protocol}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
            isCritical ? "bg-red-500/10 text-red-300" : "bg-accent/15 text-accent"
          }`}>
            {interpretation.action}
          </span>
        </div>
        <CardTitle className="text-base">{interpretation.summary}</CardTitle>
      </CardHeader>
      <CardContent>
        {interpretation.protocol === "CoW Swap" && interpretation.action === "TWAP Order" ? (
          <CowSwapTwapCard details={interpretation.details as unknown as CowSwapTwapDetails} />
        ) : isCritical ? (
          <SafePolicyCard details={interpretation.details as unknown as SafePolicyChangeDetails} />
        ) : (
          <GenericDetailsCard details={interpretation.details} />
        )}
      </CardContent>
    </Card>
  );
}
