"use client";

import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { AddressDisplay } from "@/components/address-display";
import { normalizeCallSteps, type CallStep, type ParamSummary } from "@/lib/decode";

interface CallArrayProps {
  dataDecoded: unknown;
  txTo: string;
  txValue: string;
  txOperation: number;
  txData: string | null;
}

function ParamsList({ params }: { params: ParamSummary[] }) {
  if (params.length === 0) return null;
  return (
    <span className="text-muted">
      (
      {params.map((p, i) => (
        <span key={i}>
          {i > 0 && ", "}
          <span className="text-muted">{p.name}=</span>
          {p.type === "address" && p.displayValue.startsWith("0x") ? (
            <AddressDisplay address={p.displayValue} />
          ) : (
            <code className="text-xs text-fg">{p.displayValue}</code>
          )}
        </span>
      ))}
      )
    </span>
  );
}

function CallStepRow({
  step,
  showIndex,
}: {
  step: CallStep;
  showIndex: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/[0.08] glass-subtle px-3 py-2 text-xs">
      {showIndex && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/[0.12] bg-surface-2/40 text-[10px] font-semibold text-muted">
          {step.index + 1}
        </span>
      )}
      <AddressDisplay address={step.to} />
      {step.method && (
        <>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted" />
          <span className="font-mono font-medium text-fg">{step.method}</span>
          <ParamsList params={step.params} />
        </>
      )}
    </div>
  );
}

export function CallArray({
  dataDecoded,
  txTo,
  txValue,
  txOperation,
  txData,
}: CallArrayProps) {
  const steps = useMemo(
    () => normalizeCallSteps(dataDecoded, txTo, txValue, txOperation, txData),
    [dataDecoded, txTo, txValue, txOperation, txData]
  );

  if (steps.length === 0) return null;

  const isMulti = steps.length > 1;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 font-medium text-muted">
        <span>Decoded Calls</span>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-2/60 px-1.5 text-[10px] font-semibold text-muted">
          {steps.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {steps.map((step) => (
          <CallStepRow key={step.index} step={step} showIndex={isMulti} />
        ))}
      </div>
    </div>
  );
}
