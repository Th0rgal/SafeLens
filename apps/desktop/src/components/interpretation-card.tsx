"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interpretTransaction } from "@safelens/core";
import { getRenderer, SEVERITY_STYLES } from "@/components/interpretations/registry";
import type { EvidenceContext } from "@/components/interpretations/registry";

interface InterpretationCardProps {
  dataDecoded: unknown;
  txTo: string;
  txOperation: number;
  /** Optional evidence-level context for richer display. */
  context?: EvidenceContext;
  /** Interpreter IDs to skip. */
  disabledInterpreters?: string[];
}

export function InterpretationCard({
  dataDecoded,
  txTo,
  txOperation,
  context,
  disabledInterpreters,
}: InterpretationCardProps) {
  const interpretation = useMemo(
    () => interpretTransaction(dataDecoded, txTo, txOperation, disabledInterpreters),
    [dataDecoded, txTo, txOperation, disabledInterpreters],
  );

  if (!interpretation) return null;

  const style = SEVERITY_STYLES[interpretation.severity];
  const Renderer = getRenderer(interpretation.id);

  return (
    <Card className={style.card}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${style.protocolBadge}`}>
            {interpretation.protocol}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${style.actionBadge}`}>
            {interpretation.action}
          </span>
        </div>
        <CardTitle className="text-base">{interpretation.summary}</CardTitle>
      </CardHeader>
      <CardContent>
        <Renderer details={interpretation.details} context={context} />
      </CardContent>
    </Card>
  );
}
