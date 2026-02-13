"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ChevronRight, ChevronDown, Check, AlertTriangle } from "lucide-react";
import { AddressDisplay } from "@/components/address-display";
import { TrustBadge } from "@/components/trust-badge";
import { normalizeCallSteps, verifyCalldata, type CallStep, type DecodedParam, type CalldataVerification } from "@/lib/decode";

interface CallArrayProps {
  dataDecoded: unknown;
  txTo: string;
  txValue: string;
  txOperation: number;
  txData: string | null;
}

/** Parse a Solidity tuple type string like "(address,bytes32,bytes)" into individual types. */
function parseTupleTypes(typeStr: string): string[] {
  const inner = typeStr.startsWith("(") && typeStr.endsWith(")")
    ? typeStr.slice(1, -1)
    : typeStr;
  if (!inner) return [];
  // Simple split — doesn't handle nested tuples, but sufficient for common cases
  const types: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      types.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) types.push(current.trim());
  return types;
}

function ParamValue({ type, value }: { type: string; value: unknown }) {
  // Address
  if (type === "address" && typeof value === "string" && value.startsWith("0x")) {
    return <AddressDisplay address={value} />;
  }

  // Boolean
  if (type === "bool") {
    return <span className="font-mono text-xs text-fg">{value ? "true" : "false"}</span>;
  }

  // Bytes / hex string
  if (typeof value === "string" && value.startsWith("0x")) {
    return <code className="break-all text-xs text-fg">{value}</code>;
  }

  // Default — full string representation
  return <span className="font-mono text-xs text-fg">{String(value)}</span>;
}

function ExpandableArray({
  type,
  value,
}: {
  type: string;
  value: unknown[];
}) {
  const [open, setOpen] = useState(false);

  // Determine element types
  const isTuple = type.startsWith("(");
  const isArrayType = type.endsWith("[]");
  let elementTypes: string[];
  if (isTuple) {
    elementTypes = parseTupleTypes(type);
  } else if (isArrayType) {
    const baseType = type.slice(0, -2);
    elementTypes = value.map(() => baseType);
  } else {
    elementTypes = value.map(() => "bytes");
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 font-mono text-xs text-muted hover:text-fg transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="text-muted">{type}</span>
      </button>
      {open && (
        <div className="ml-4 mt-1 space-y-1 border-l border-border/[0.08] pl-3">
          {value.map((el, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="shrink-0 font-mono text-[10px] text-muted">[{i}]</span>
              <ParamValue type={elementTypes[i] ?? "bytes"} value={el} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ParamRow({ param }: { param: DecodedParam }) {
  const isExpandable = Array.isArray(param.value);

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 items-baseline">
      <span className="shrink-0 font-mono text-xs text-muted">{param.name}</span>
      <div className="min-w-0">
        {isExpandable ? (
          <ExpandableArray type={param.type} value={param.value as unknown[]} />
        ) : (
          <ParamValue type={param.type} value={param.value} />
        )}
      </div>
    </div>
  );
}

function VerificationIcon({ result }: { result: CalldataVerification }) {
  if (result.status === "verified") {
    return <Check className="h-3 w-3 shrink-0 text-emerald-400" />;
  }
  if (result.status === "no-data") return null;
  return <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />;
}

function CallStepCard({
  step,
  showIndex,
  verification,
}: {
  step: CallStep;
  showIndex: boolean;
  verification: CalldataVerification;
}) {
  return (
    <div className="rounded-md border border-border/[0.08] glass-subtle px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
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
          </>
        )}
        <VerificationIcon result={verification} />
      </div>
      {step.params.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-border/[0.06] pt-2">
          {step.params.map((param, i) => (
            <ParamRow key={i} param={param} />
          ))}
        </div>
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

  const verifications = useMemo(
    () => steps.map((step) => verifyCalldata(step)),
    [steps]
  );

  if (steps.length === 0) return null;

  const isMulti = steps.length > 1;
  const allVerified = verifications.every((v) => v.status === "verified");

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 font-medium text-muted">
        <span>Decoded Calls</span>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-2/60 px-1.5 text-[10px] font-semibold text-muted">
          {steps.length}
        </span>
        <TrustBadge level={allVerified ? "self-verified" : "api-sourced"} />
      </div>
      <div className="space-y-1.5">
        {steps.map((step, i) => (
          <CallStepCard key={step.index} step={step} showIndex={isMulti} verification={verifications[i]} />
        ))}
      </div>
    </div>
  );
}
