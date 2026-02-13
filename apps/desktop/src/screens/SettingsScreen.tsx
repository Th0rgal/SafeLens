import { useState, useEffect, useRef, useMemo } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  exportSettingsConfig,
  settingsConfigSchema,
  type SettingsConfig,
  type ChainConfig,
  type AddressBookEntry,
  type ContractRegistryEntry,
} from "@safelens/core";
import { useSettingsConfig } from "@/lib/settings/hooks";
import { createTauriSettingsStore } from "@/lib/settings/store";
import { save } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";

export default function SettingsScreen() {
  const { config: savedConfig, saveConfig, resetConfig } = useSettingsConfig();
  const { success: toastSuccess, warning: toastWarning } = useToast();
  const store = useMemo(() => createTauriSettingsStore(), []);

  const [draft, setDraft] = useState<SettingsConfig | null>(null);
  const [chainEntries, setChainEntries] = useState<[string, ChainConfig][]>([]);

  useEffect(() => {
    if (savedConfig && !draft) {
      setDraft(savedConfig);
      setChainEntries(Object.entries(savedConfig.chains));
    }
  }, [savedConfig, draft]);

  const [newChainId, setNewChainId] = useState("");
  const [newChainName, setNewChainName] = useState("");
  const [newChainRpc, setNewChainRpc] = useState("");
  const [newChainSafeApi, setNewChainSafeApi] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newAddressName, setNewAddressName] = useState("");
  const [newContract, setNewContract] = useState("");
  const [newContractName, setNewContractName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!draft || !savedConfig) return null;

  const fullDraft: SettingsConfig = {
    ...draft,
    chains: Object.fromEntries(chainEntries),
  };
  const isModified = JSON.stringify(fullDraft) !== JSON.stringify(savedConfig);

  const updateDraft = (fn: (d: SettingsConfig) => SettingsConfig) =>
    setDraft((prev) => (prev ? fn(prev) : prev));

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

  const updateAddressBookEntry = (i: number, updates: Partial<AddressBookEntry>) =>
    updateDraft((d) => ({
      ...d,
      addressBook: d.addressBook.map((e, idx) => (idx === i ? { ...e, ...updates } : e)),
    }));

  const removeAddressBookEntry = (i: number) =>
    updateDraft((d) => ({ ...d, addressBook: d.addressBook.filter((_, idx) => idx !== i) }));

  const updateContractRegistryEntry = (i: number, updates: Partial<ContractRegistryEntry>) =>
    updateDraft((d) => ({
      ...d,
      contractRegistry: d.contractRegistry.map((e, idx) => (idx === i ? { ...e, ...updates } : e)),
    }));

  const removeContractRegistryEntry = (i: number) =>
    updateDraft((d) => ({ ...d, contractRegistry: d.contractRegistry.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    await saveConfig(fullDraft);
    toastSuccess("Settings saved", "Your settings have been updated.");
  };

  const handleDiscard = () => {
    setDraft(savedConfig);
    setChainEntries(Object.entries(savedConfig.chains));
  };

  const handleReset = async () => {
    await resetConfig();
    setDraft(null);
    setChainEntries([]);
  };

  const handleExport = async () => {
    try {
      const json = await exportSettingsConfig(store);
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
      setDraft(imported);
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
      [newChainId, {
        name: newChainName,
        rpcUrl: newChainRpc || undefined,
        safeApiUrl: newChainSafeApi || undefined,
      }],
    ]);
    setNewChainId("");
    setNewChainName("");
    setNewChainRpc("");
    setNewChainSafeApi("");
  };

  const handleAddAddress = () => {
    if (!newAddress || !newAddressName) return;
    updateDraft((d) => ({
      ...d,
      addressBook: [...d.addressBook, { address: newAddress, name: newAddressName }],
    }));
    setNewAddress("");
    setNewAddressName("");
  };

  const handleAddContract = () => {
    if (!newContract || !newContractName) return;
    updateDraft((d) => ({
      ...d,
      contractRegistry: [...d.contractRegistry, { address: newContract, name: newContractName }],
    }));
    setNewContract("");
    setNewContractName("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-2 text-2xl font-bold">Settings</h2>
          <p className="text-muted">
            Configure chain endpoints, address book, and contract registry.
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
                <div className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-4">
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
                    value={chain.rpcUrl ?? ""}
                    onChange={(e) => updateChain(index, { rpcUrl: e.target.value || undefined })}
                    placeholder="RPC URL"
                    className="text-xs"
                  />
                  <Input
                    value={chain.safeApiUrl ?? ""}
                    onChange={(e) => updateChain(index, { safeApiUrl: e.target.value || undefined })}
                    placeholder="Safe API URL"
                    className="text-xs"
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeChain(index)} className="h-9 w-9 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-start gap-2 border-t border-border/15 pt-2">
              <div className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-4">
                <Input value={newChainId} onChange={(e) => setNewChainId(e.target.value)} placeholder="Chain ID" className="text-xs" />
                <Input value={newChainName} onChange={(e) => setNewChainName(e.target.value)} placeholder="Name" className="text-xs" />
                <Input value={newChainRpc} onChange={(e) => setNewChainRpc(e.target.value)} placeholder="RPC URL" className="text-xs" />
                <Input value={newChainSafeApi} onChange={(e) => setNewChainSafeApi(e.target.value)} placeholder="Safe API URL" className="text-xs" />
              </div>
              <Button variant="ghost" size="icon" onClick={handleAddChain} disabled={!newChainId || !newChainName} className="h-9 w-9 shrink-0">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Address Book</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {draft.addressBook.map((entry, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={entry.address}
                  onChange={(e) => updateAddressBookEntry(i, { address: e.target.value })}
                  className="flex-1 text-xs font-mono"
                />
                <Input
                  value={entry.name}
                  onChange={(e) => updateAddressBookEntry(i, { name: e.target.value })}
                  className="w-40 text-xs"
                />
                <Button variant="ghost" size="icon" onClick={() => removeAddressBookEntry(i)} className="h-9 w-9 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t border-border/15 pt-2">
              <Input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="0x..." className="flex-1 text-xs" />
              <Input value={newAddressName} onChange={(e) => setNewAddressName(e.target.value)} placeholder="Name" className="w-40 text-xs" />
              <Button variant="ghost" size="icon" onClick={handleAddAddress} disabled={!newAddress || !newAddressName} className="h-9 w-9 shrink-0">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contract Registry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {draft.contractRegistry.map((entry, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={entry.address}
                  onChange={(e) => updateContractRegistryEntry(i, { address: e.target.value })}
                  className="flex-1 text-xs font-mono"
                />
                <Input
                  value={entry.name}
                  onChange={(e) => updateContractRegistryEntry(i, { name: e.target.value })}
                  className="w-40 text-xs"
                />
                <Button variant="ghost" size="icon" onClick={() => removeContractRegistryEntry(i)} className="h-9 w-9 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t border-border/15 pt-2">
              <Input value={newContract} onChange={(e) => setNewContract(e.target.value)} placeholder="0x..." className="flex-1 text-xs" />
              <Input value={newContractName} onChange={(e) => setNewContractName(e.target.value)} placeholder="Name" className="w-40 text-xs" />
              <Button variant="ghost" size="icon" onClick={handleAddContract} disabled={!newContract || !newContractName} className="h-9 w-9 shrink-0">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleExport} variant="outline" size="sm">Export</Button>
          <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm">Import</Button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          <Button onClick={handleReset} variant="ghost" size="sm">Reset</Button>
        </div>
      </div>
    </div>
  );
}
