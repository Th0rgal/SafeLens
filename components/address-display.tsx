"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsConfig, resolveAddress, resolveContract } from "@/lib/settings";

interface AddressDisplayProps {
  address: string;
  className?: string;
}

export function AddressDisplay({ address, className }: AddressDisplayProps) {
  const { config } = useSettingsConfig();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const resolved = config
    ? resolveAddress(address, config) ?? resolveContract(address, config)?.name ?? null
    : null;

  const displayText = resolved ?? address;
  const isResolved = resolved !== null;

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    [address]
  );

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <span ref={ref} className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs leading-tight transition-colors",
          isResolved
            ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
            : "border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15"
        )}
      >
        {displayText}
      </button>

      {open && (
        <span className="absolute bottom-full left-0 z-50 mb-2 flex items-center gap-2 whitespace-nowrap rounded-md border border-border/[0.12] glass-panel px-3 py-2 text-xs shadow-glass-sm">
          <code className="font-mono text-fg">{address}</code>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded p-0.5 text-muted hover:text-fg transition-colors"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </span>
      )}
    </span>
  );
}
