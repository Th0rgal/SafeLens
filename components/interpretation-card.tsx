"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interpretTransaction } from "@/lib/interpret";
import type { CowSwapTwapDetails } from "@/lib/interpret";
import { CowSwapTwapCard } from "@/components/interpretations/cowswap-twap-card";
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

  return (
    <Card className="border border-accent/20 bg-accent/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-white">
            {interpretation.protocol}
          </span>
          <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent-hover">
            {interpretation.action}
          </span>
        </div>
        <CardTitle className="text-base">{interpretation.summary}</CardTitle>
      </CardHeader>
      <CardContent>
        {interpretation.protocol === "CoW Swap" && interpretation.action === "TWAP Order" ? (
          <CowSwapTwapCard details={interpretation.details as unknown as CowSwapTwapDetails} />
        ) : (
          <GenericDetailsCard details={interpretation.details} />
        )}
      </CardContent>
    </Card>
  );
}
