import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { SettingsConfig, AddressBookEntry, ContractRegistryEntry } from "@safelens/core";
import { useSettingsConfig } from "@/lib/settings/hooks";

export default function AddressBookScreen() {
  const { config: savedConfig, saveConfig } = useSettingsConfig();
  const { success: toastSuccess, warning: toastWarning } = useToast();

  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [contracts, setContracts] = useState<ContractRegistryEntry[]>([]);
  const [newAddress, setNewAddress] = useState("");
  const [newName, setNewName] = useState("");
  const [newContract, setNewContract] = useState("");
  const [newContractName, setNewContractName] = useState("");
  const [newAddressChainIds, setNewAddressChainIds] = useState("");
  const [newContractChainIds, setNewContractChainIds] = useState("");
  const [entryChainIdDrafts, setEntryChainIdDrafts] = useState<Record<number, string>>({});
  const [contractChainIdDrafts, setContractChainIdDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (savedConfig) {
      setEntries(savedConfig.addressBook);
      setContracts(savedConfig.contractRegistry);
    }
  }, [savedConfig]);

  if (!savedConfig) return null;

  const isModified =
    JSON.stringify(entries) !== JSON.stringify(savedConfig.addressBook) ||
    JSON.stringify(contracts) !== JSON.stringify(savedConfig.contractRegistry);

  const updateEntry = (i: number, updates: Partial<AddressBookEntry>) =>
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...updates } : e)));

  const parseChainIds = (input: string): number[] | undefined => {
    const parsed = input
      .split(",")
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((num) => Number.isFinite(num) && num > 0);
    if (parsed.length === 0) return undefined;
    return Array.from(new Set(parsed));
  };

  const entryChainIdsText = (entry: { chainIds?: number[] }): string => {
    if (entry.chainIds && entry.chainIds.length > 0) return entry.chainIds.join(", ");
    return "";
  };

  const removeEntry = (i: number) =>
    setEntries((prev) => prev.filter((_, idx) => idx !== i));

  const handleAdd = () => {
    if (!newAddress || !newName) return;
    const chainIds = parseChainIds(newAddressChainIds);
    setEntries((prev) => [...prev, { address: newAddress, name: newName, ...(chainIds ? { chainIds } : {}) }]);
    setNewAddress("");
    setNewName("");
    setNewAddressChainIds("");
  };

  const updateContract = (i: number, updates: Partial<ContractRegistryEntry>) =>
    setContracts((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...updates } : e)));

  const removeContract = (i: number) =>
    setContracts((prev) => prev.filter((_, idx) => idx !== i));

  const handleAddContract = () => {
    if (!newContract || !newContractName) return;
    const chainIds = parseChainIds(newContractChainIds);
    setContracts((prev) => [...prev, { address: newContract, name: newContractName, ...(chainIds ? { chainIds } : {}) }]);
    setNewContract("");
    setNewContractName("");
    setNewContractChainIds("");
  };

  const handleSave = async () => {
    const updated: SettingsConfig = { ...savedConfig, addressBook: entries, contractRegistry: contracts };
    try {
      await saveConfig(updated);
      toastSuccess("Address book saved", "Your address book has been updated.");
    } catch {
      toastWarning("Save failed", "Could not persist settings to disk.");
    }
  };

  const handleDiscard = () => {
    setEntries(savedConfig.addressBook);
    setContracts(savedConfig.contractRegistry);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-2 text-2xl font-bold">Address Book</h2>
          <p className="text-muted">
            Label addresses and contracts so they are easier to identify during verification.
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

      <Card>
        <CardHeader>
          <CardTitle>Addresses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={entry.address}
                onChange={(e) => updateEntry(i, { address: e.target.value })}
                className="flex-1 text-xs font-mono"
              />
              <Input
                value={entry.name}
                onChange={(e) => updateEntry(i, { name: e.target.value })}
                className="w-36 text-xs"
              />
              <Input
                value={entryChainIdDrafts[i] ?? entryChainIdsText(entry)}
                onChange={(e) => setEntryChainIdDrafts((prev) => ({ ...prev, [i]: e.target.value }))}
                onBlur={() => {
                  const raw = entryChainIdDrafts[i];
                  if (raw === undefined) return;
                  const chainIds = parseChainIds(raw);
                  updateEntry(i, { chainIds: chainIds ?? undefined });
                  setEntryChainIdDrafts((prev) => {
                    const next = { ...prev };
                    delete next[i];
                    return next;
                  });
                }}
                placeholder="Chain IDs (optional)"
                className="w-48 text-xs"
              />
              <Button variant="ghost" size="icon" onClick={() => removeEntry(i)} className="h-9 w-9 shrink-0">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2 border-t border-border/15 pt-2">
            <Input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="0x..." className="flex-1 text-xs" />
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="w-36 text-xs" />
            <Input
              value={newAddressChainIds}
              onChange={(e) => setNewAddressChainIds(e.target.value)}
              placeholder="Chain IDs (optional)"
              className="w-48 text-xs"
            />
            <Button variant="ghost" size="icon" onClick={handleAdd} disabled={!newAddress || !newName} className="h-9 w-9 shrink-0">
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
          {contracts.map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={entry.address}
                onChange={(e) => updateContract(i, { address: e.target.value })}
                className="flex-1 text-xs font-mono"
              />
              <Input
                value={entry.name}
                onChange={(e) => updateContract(i, { name: e.target.value })}
                className="w-36 text-xs"
              />
              <Input
                value={contractChainIdDrafts[i] ?? entryChainIdsText(entry)}
                onChange={(e) => setContractChainIdDrafts((prev) => ({ ...prev, [i]: e.target.value }))}
                onBlur={() => {
                  const raw = contractChainIdDrafts[i];
                  if (raw === undefined) return;
                  const chainIds = parseChainIds(raw);
                  updateContract(i, { chainIds: chainIds ?? undefined });
                  setContractChainIdDrafts((prev) => {
                    const next = { ...prev };
                    delete next[i];
                    return next;
                  });
                }}
                placeholder="Chain IDs (optional)"
                className="w-48 text-xs"
              />
              <Button variant="ghost" size="icon" onClick={() => removeContract(i)} className="h-9 w-9 shrink-0">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2 border-t border-border/15 pt-2">
            <Input value={newContract} onChange={(e) => setNewContract(e.target.value)} placeholder="0x..." className="flex-1 text-xs" />
            <Input value={newContractName} onChange={(e) => setNewContractName(e.target.value)} placeholder="Name" className="w-36 text-xs" />
            <Input
              value={newContractChainIds}
              onChange={(e) => setNewContractChainIds(e.target.value)}
              placeholder="Chain IDs (optional)"
              className="w-48 text-xs"
            />
            <Button variant="ghost" size="icon" onClick={handleAddContract} disabled={!newContract || !newContractName} className="h-9 w-9 shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
