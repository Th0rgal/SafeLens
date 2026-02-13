import { useState, useEffect, useRef, useMemo } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  settingsConfigSchema,
  type SettingsConfig,
  type ChainConfig,
} from "@safelens/core";
import { useSettingsConfig } from "@/lib/settings/hooks";
import { save } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";

export default function SettingsScreen() {
  const { config: savedConfig, saveConfig, resetConfig } = useSettingsConfig();
  const { success: toastSuccess, warning: toastWarning } = useToast();

  const [chainEntries, setChainEntries] = useState<[string, ChainConfig][]>([]);

  useEffect(() => {
    if (!savedConfig) return;
    setChainEntries((prev) =>
      prev.length === 0 ? Object.entries(savedConfig.chains) : prev
    );
  }, [savedConfig]);

  const [newChainId, setNewChainId] = useState("");
  const [newChainName, setNewChainName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fullDraft = useMemo<SettingsConfig | null>(
    () => savedConfig ? { ...savedConfig, chains: Object.fromEntries(chainEntries) } : null,
    [savedConfig, chainEntries],
  );
  const isModified = useMemo(
    () => fullDraft !== null && savedConfig !== null && JSON.stringify(fullDraft) !== JSON.stringify(savedConfig),
    [fullDraft, savedConfig],
  );

  if (!savedConfig || !fullDraft) return null;

  const updateChain = (index: number, updates: Partial<ChainConfig>) =>
    setChainEntries((prev) =>
      prev.map((entry, i) => (i === index ? [entry[0], { ...entry[1], ...updates }] : entry))
    );

  const renameChain = (index: number, newId: string) =>
    setChainEntries((prev) =>
      prev.map((entry, i) => (i === index ? [newId, entry[1]] : entry))
    );

  const removeChain = (index: number) =>
    setChainEntries((prev) => prev.filter((_, i) => i !== index));

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
    setChainEntries([]);
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
      ...prev,
      [newChainId, { name: newChainName }],
    ]);
    setNewChainId("");
    setNewChainName("");
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
                <div className="grid flex-1 grid-cols-2 gap-2">
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
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeChain(index)} className="h-9 w-9 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-start gap-2 border-t border-border/15 pt-2">
              <div className="grid flex-1 grid-cols-2 gap-2">
                <Input value={newChainId} onChange={(e) => setNewChainId(e.target.value)} placeholder="Chain ID" className="text-xs" />
                <Input value={newChainName} onChange={(e) => setNewChainName(e.target.value)} placeholder="Name" className="text-xs" />
              </div>
              <Button variant="ghost" size="icon" onClick={handleAddChain} disabled={!newChainId || !newChainName} className="h-9 w-9 shrink-0">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <p className="text-xs text-muted">Export and import includes chains, address book, and contract registry.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExport} variant="outline" size="sm">Export</Button>
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm">Import</Button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
            <Button onClick={handleReset} variant="ghost" size="sm">Reset</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
