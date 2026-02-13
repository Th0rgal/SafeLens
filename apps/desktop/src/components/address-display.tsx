"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Copy, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsConfig } from "@/lib/settings/hooks";
import { resolveAddress, resolveContract } from "@safelens/core";

interface AddressDisplayProps {
  address: string;
  className?: string;
}

export function AddressDisplay({ address, className }: AddressDisplayProps) {
  const { config, saveConfig } = useSettingsConfig();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const ref = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleSave = useCallback(async () => {
    if (!config || !nameInput.trim()) return;
    try {
      await saveConfig({
        ...config,
        addressBook: [...config.addressBook, { address, name: nameInput.trim() }],
      });
    } catch {
      // Store write may fail in dev mode — state update still applied by provider
    }
    setAdding(false);
    setNameInput("");
    setOpen(false);
  }, [config, saveConfig, address, nameInput]);

  const handleCancelAdd = useCallback(() => {
    setAdding(false);
    setNameInput("");
  }, []);

  // Focus input when adding mode activates
  useEffect(() => {
    if (adding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [adding]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setNameInput("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setAdding(false);
        setNameInput("");
      }
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
          "inline-flex items-center rounded px-2 py-0.5 font-mono text-xs leading-tight transition-colors",
          isResolved
            ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
            : "border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15"
        )}
      >
        {displayText}
      </button>

      {open && (
        <span className="absolute bottom-full left-0 z-50 mb-2 flex flex-col gap-2 whitespace-nowrap rounded-md border border-border/15 glass-panel px-3 py-2 text-xs">
          {!isResolved && (
            <span className="text-[10px] font-medium text-amber-400">Not in your address book</span>
          )}
          <span className="flex items-center gap-2">
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
          {!isResolved && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium text-accent hover:bg-surface-2/40 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add to address book
            </button>
          )}
          {!isResolved && adding && (
            <span className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") handleCancelAdd();
                }}
                placeholder="Name"
                className="w-28 rounded border border-border/15 bg-surface-2/40 px-1.5 py-0.5 text-[11px] text-fg outline-none focus:border-accent/40"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={!nameInput.trim()}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleCancelAdd}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted hover:text-fg transition-colors"
              >
                Cancel
              </button>
            </span>
          )}
        </span>
      )}
    </span>
  );
}
