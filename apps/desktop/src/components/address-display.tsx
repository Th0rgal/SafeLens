"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Copy, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsConfig } from "@/lib/settings/hooks";
import { resolveAddress, resolveContract } from "@safelens/core";

interface AddressDisplayProps {
  address: string;
  className?: string;
  /** Chain ID for chain-aware resolution and default when saving. */
  chainId?: number;
}

export function AddressDisplay({ address, className, chainId }: AddressDisplayProps) {
  const { config, saveConfig } = useSettingsConfig();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [selectedChainId, setSelectedChainId] = useState<number | undefined>(chainId);
  const ref = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const resolved = config
    ? resolveAddress(address, config, chainId) ?? resolveContract(address, config, chainId)?.name ?? null
    : null;

  const displayText = resolved ?? address;
  const isResolved = resolved !== null;

  useEffect(() => {
    if (!open || !popupRef.current || !ref.current) return;
    const popup = popupRef.current;
    const trigger = ref.current;
    const triggerRect = trigger.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const pad = 8;

    let top: number;
    if (triggerRect.top - popupRect.height - pad >= 0) {
      top = -(popupRect.height + 8);
    } else {
      top = triggerRect.height + 8;
    }

    let left = 0;
    const popupRight = triggerRect.left + popupRect.width;
    if (popupRight > window.innerWidth - pad) {
      left = -(popupRight - window.innerWidth + pad);
    }
    if (triggerRect.left + left < pad) {
      left = -(triggerRect.left - pad);
    }

    setPopupStyle({ top, left });
  }, [open, adding]);

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
        addressRegistry: [
          ...config.addressRegistry,
          {
            address,
            name: nameInput.trim(),
            kind: "eoa",
            ...(selectedChainId !== undefined && { chainIds: [selectedChainId] }),
          },
        ],
      });
    } catch {
      // Store write may fail in dev mode — state update still applied by provider
    }
    setAdding(false);
    setNameInput("");
    setSelectedChainId(chainId);
    setOpen(false);
  }, [config, saveConfig, address, nameInput, selectedChainId, chainId]);

  const handleCancelAdd = useCallback(() => {
    setAdding(false);
    setNameInput("");
    setSelectedChainId(chainId);
  }, [chainId]);

  useEffect(() => {
    if (adding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [adding]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setNameInput("");
        setSelectedChainId(chainId);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, chainId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setAdding(false);
        setNameInput("");
        setSelectedChainId(chainId);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, chainId]);

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
        <span
          ref={popupRef}
          style={popupStyle}
          className="absolute z-50 flex flex-col gap-2 whitespace-nowrap rounded-md border border-border/15 glass-panel px-3 py-2 text-xs shadow-lg"
        >
          {!isResolved && (
            <span className="text-[10px] font-medium text-amber-400">Not in your address registry</span>
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
              Add to registry
            </button>
          )}
          {!isResolved && adding && (
            <span className="flex flex-col gap-1.5">
              <select
                value={selectedChainId ?? "all"}
                onChange={(e) =>
                  setSelectedChainId(e.target.value === "all" ? undefined : Number(e.target.value))
                }
                className="w-full rounded border border-border/15 bg-surface-2/40 px-1.5 py-0.5 text-[11px] text-fg outline-none focus:border-accent/40"
              >
                <option value="all">All chains</option>
                {config &&
                  Object.entries(config.chains).map(([id, chain]) => (
                    <option key={id} value={id}>
                      {chain.name} ({id})
                    </option>
                  ))}
              </select>
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
                className="w-full rounded border border-border/15 bg-surface-2/40 px-1.5 py-0.5 text-[11px] text-fg outline-none focus:border-accent/40"
              />
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!nameInput.trim()}
                  className="flex-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleCancelAdd}
                  className="flex-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted hover:text-fg transition-colors"
                >
                  Cancel
                </button>
              </span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}
