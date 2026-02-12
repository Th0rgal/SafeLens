"use client";

import { useState, useEffect, useRef } from "react";
import { Copy, Check, Fingerprint } from "lucide-react";
import { useSettingsConfig } from "@/lib/settings";
import { computeConfigFingerprint, colorFromHash } from "@/lib/settings/fingerprint";

export function ConfigFingerprint() {
  const { config } = useSettingsConfig();
  const [hash, setHash] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!config) return;
    computeConfigFingerprint(config).then(setHash);
  }, [config]);

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

  if (!hash) return null;

  const short = hash.slice(0, 8);
  const color = colorFromHash(hash);

  const handleCopy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border/[0.12] glass-subtle px-2.5 py-1 text-xs transition-colors hover:border-border/[0.2]"
      >
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="font-mono text-muted">{short}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-md border border-border/[0.12] glass-panel p-4 shadow-glass-sm">
          <div className="mb-3 flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-muted" />
            <span className="text-xs font-medium text-fg">Settings Fingerprint</span>
          </div>

          <div className="mb-3 flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <code className="flex-1 break-all text-xs text-muted">{hash}</code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded p-0.5 text-muted hover:text-fg transition-colors"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          <p className="text-xs leading-relaxed text-subtle">
            This fingerprint changes if your settings (chains, address book, contracts) are modified. If it looks different from what you expect, check your{" "}
            <a href="/settings" className="text-accent hover:text-accent-hover">
              settings
            </a>.
          </p>
        </div>
      )}
    </div>
  );
}
