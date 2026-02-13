"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface AddressDisplayProps {
  address: string;
  className?: string;
}

export function AddressDisplay({ address, className }: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  return (
    <span className={className}>
      <span className="inline-flex items-center gap-2 rounded-full border border-border/[0.12] bg-surface-2/40 px-2 py-0.5 font-mono text-xs">
        {address}
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded p-0.5 text-muted hover:text-fg transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </button>
      </span>
    </span>
  );
}
