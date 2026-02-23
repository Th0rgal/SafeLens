import { useState, useEffect, useRef, useMemo } from "react";
import { Plus, X, CheckCircle2, AlertTriangle, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  settingsConfigSchema,
  type SettingsConfig,
  type ChainConfig,
  getNetworkCapability,
} from "@safelens/core";
import { useSettingsConfig } from "@/lib/settings/hooks";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

type ChainSupportStatus = "full" | "partial" | "none";

function getChainSupportStatus(chainIdRaw: string): ChainSupportStatus {
  const parsed = Number.parseInt(chainIdRaw, 10);
  if (!Number.isFinite(parsed)) return "none";
  const capability = getNetworkCapability(parsed);
  if (capability?.consensusMode === "beacon") return "full";
  if (capability?.consensusMode === "opstack" || capability?.consensusMode === "linea") return "partial";
  return "none";
}

function ChainSupportInfoButton({ support }: { support: ChainSupportStatus }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const iconClass =
    support === "full"
      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20"
      : support === "partial"
        ? "border-amber-500/30 bg-amber-500/15 text-amber-300 hover:bg-amber-500/20"
        : "border-border/20 bg-surface-2/40 text-muted hover:bg-surface-2/60";

  const title =
    support === "full"
      ? "Full Helios Support"
      : support === "partial"
        ? "Partial Consensus Support"
        : "No Helios Support";

  const description =
    support === "full"
      ? "This chain has built-in support for on-chain transaction simulation and Safe policy verification, fully verified locally."
      : support === "partial"
        ? "This chain has built-in partial support. Simulation and policy checks run locally, but consensus envelope data can be spoofed by a malicious RPC, so it is not equivalent to full light-client verification."
        : "No consensus verification path is hardcoded for this chain, so Helios-backed on-chain consensus verification is unavailable.";

  return (
    <div ref={wrapperRef} className="relative mt-1 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${iconClass}`}
        title={title}
      >
        {support === "full" ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : support === "partial" ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <Circle className="h-3.5 w-3.5" />
        )}
      </button>
      {open && (
        <div className="absolute left-9 top-0 z-50 w-80 rounded-md border border-border/15 glass-panel px-3 py-2.5 text-xs shadow-lg">
          <div className="font-medium text-fg">{title}</div>
          <div className="mt-1 text-muted">{description}</div>
        </div>
      )}
    </div>
  );
}

function RemoveChainButton({
  locked,
  onRemove,
}: {
  locked: boolean;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative h-9 w-9 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          if (locked) setOpen((v) => !v);
          else onRemove();
        }}
        className={`h-9 w-9 ${
          locked
            ? "text-muted/40 hover:bg-surface-2/40 hover:text-muted/60"
            : ""
        }`}
        title={locked ? "Built-in Helios chain (cannot remove)" : "Remove chain"}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
      {open && locked && (
        <div className="absolute right-10 top-0 z-50 w-80 rounded-md border border-border/15 glass-panel px-3 py-2.5 text-xs shadow-lg">
          <div className="font-medium text-fg">Cannot Remove Built-in Chain</div>
          <div className="mt-1 text-muted">
            This chain has built-in Helios support in SafeLens, so it cannot be removed from settings.
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsScreen() {
  const { config: savedConfig, saveConfig, resetConfig } = useSettingsConfig();
  const { success: toastSuccess, warning: toastWarning } = useToast();

  const [chainEntries, setChainEntries] = useState<[string, ChainConfig][] | null>(null);

  useEffect(() => {
    if (!savedConfig) return;
    setChainEntries((prev) => (prev === null ? Object.entries(savedConfig.chains) : prev));
  }, [savedConfig]);

  const [newChainId, setNewChainId] = useState("");
  const [newChainName, setNewChainName] = useState("");
  const [newChainNativeSymbol, setNewChainNativeSymbol] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fullDraft = useMemo<SettingsConfig | null>(
    () => (
      savedConfig && chainEntries !== null
        ? { ...savedConfig, chains: Object.fromEntries(chainEntries) }
        : null
    ),
    [savedConfig, chainEntries],
  );
  const isModified = useMemo(
    () => (
      fullDraft !== null &&
      savedConfig !== null &&
      JSON.stringify(fullDraft) !== JSON.stringify(savedConfig)
    ),
    [fullDraft, savedConfig],
  );

  if (!savedConfig || !fullDraft || chainEntries === null) return null;

  const updateChain = (index: number, updates: Partial<ChainConfig>) =>
    setChainEntries((prev) =>
      (prev ?? []).map((entry, i) => (i === index ? [entry[0], { ...entry[1], ...updates }] : entry))
    );

  const renameChain = (index: number, newId: string) =>
    setChainEntries((prev) =>
      (prev ?? []).map((entry, i) => (i === index ? [newId, entry[1]] : entry))
    );

  const removeChain = (index: number) =>
    setChainEntries((prev) => (prev ?? []).filter((_, i) => i !== index));

  const handleSave = async () => {
    try {
      await saveConfig(fullDraft);
      toastSuccess("Settings saved", "Your settings have been updated.");
    } catch {
      toastWarning("Save failed", "Could not persist settings to disk.");
    }
  };

  const handleDiscard = () => {
    setChainEntries(Object.entries(savedConfig.chains));
  };

  const handleReset = async () => {
    await resetConfig();
    setChainEntries(null);
  };

  const handleExport = async () => {
    try {
      const json = JSON.stringify(settingsConfigSchema.parse(savedConfig), null, 2);
      const path = await save({
        defaultPath: "safelens-settings.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await writeTextFile(path, json);
      toastSuccess("Settings exported", path);
    } catch {
      toastWarning(
        "Export failed",
        "Could not write file to the selected location."
      );
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = settingsConfigSchema.parse(JSON.parse(text));
      await saveConfig(imported);
      setChainEntries(Object.entries(imported.chains));
      toastSuccess("Settings imported", "Your local settings were updated.");
    } catch {
      toastWarning("Import failed", "Invalid config file.");
    }
  };

  const handleAddChain = () => {
    if (!newChainId || !newChainName) return;
    setChainEntries((prev) => [
      ...(prev ?? []),
      [newChainId, { name: newChainName, ...(newChainNativeSymbol ? { nativeTokenSymbol: newChainNativeSymbol } : {}) }],
    ]);
    setNewChainId("");
    setNewChainName("");
    setNewChainNativeSymbol("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-2 text-2xl font-bold">Settings</h2>
          <p className="text-muted">
            Configure chains, import and export settings.
          </p>
        </div>
        {isModified && (
          <div className="flex shrink-0 items-center gap-3">
            <span className="flex items-center gap-2 text-xs text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Unsaved changes
            </span>
            <Button onClick={handleDiscard} variant="ghost" size="sm">
              Discard
            </Button>
            <Button onClick={handleSave} size="sm">
              Save
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Chains</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {chainEntries.map(([chainId, chain], index) => (
              <div key={index} className="flex items-start gap-2">
                {(() => {
                  const support = getChainSupportStatus(chainId);
                  const removeLocked = support === "full";
                  return (
                    <>
                      <ChainSupportInfoButton support={support} />

                      <div className="grid flex-1 grid-cols-3 gap-2">
                        <Input
                          value={chainId}
                          onChange={(e) => renameChain(index, e.target.value)}
                          className="text-xs"
                        />
                        <Input
                          value={chain.name}
                          onChange={(e) => updateChain(index, { name: e.target.value })}
                          placeholder="Name"
                          className="text-xs"
                        />
                        <Input
                          value={chain.nativeTokenSymbol ?? ""}
                          onChange={(e) => updateChain(index, { nativeTokenSymbol: e.target.value || undefined })}
                          placeholder="Native token symbol"
                          className="text-xs"
                        />
                      </div>

                      <RemoveChainButton
                        locked={removeLocked}
                        onRemove={() => removeChain(index)}
                      />
                    </>
                  );
                })()}
                </div>
            ))}
            <div className="flex items-start gap-2 border-t border-border/15 pt-2">
              <div className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/20 bg-surface-2/40 text-muted">
                <Circle className="h-3.5 w-3.5" />
              </div>
              <div className="grid flex-1 grid-cols-3 gap-2">
                <Input value={newChainId} onChange={(e) => setNewChainId(e.target.value)} placeholder="Chain ID" className="text-xs" />
                <Input value={newChainName} onChange={(e) => setNewChainName(e.target.value)} placeholder="Name" className="text-xs" />
                <Input value={newChainNativeSymbol} onChange={(e) => setNewChainNativeSymbol(e.target.value)} placeholder="Native token symbol" className="text-xs" />
              </div>
              <Button variant="ghost" size="icon" onClick={handleAddChain} disabled={!newChainId || !newChainName} className="h-9 w-9 shrink-0">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <p className="text-xs text-muted">Export and import includes chains, address registry, ERC-7730 descriptors, and interpreter preferences. Manage clear signing interpreters and descriptors in the Clear Signing tab.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExport} variant="outline" size="sm">Export</Button>
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm">Import</Button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
            <Button onClick={handleReset} variant="outline" size="sm" className="text-red-400/70 hover:text-red-400 border-red-500/15 hover:border-red-500/25">Reset</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
