import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { SettingsConfig, AddressRegistryEntry } from "@safelens/core";
import { useSettingsConfig } from "@/lib/settings/hooks";

export default function AddressBookScreen() {
  const { config: savedConfig, saveConfig } = useSettingsConfig();
  const { success: toastSuccess, warning: toastWarning } = useToast();

  const [entries, setEntries] = useState<AddressRegistryEntry[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [chainIdDrafts, setChainIdDrafts] = useState<Record<number, string>>({});
  const [newAddress, setNewAddress] = useState("");
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("Custom");
  const [newGroupMode, setNewGroupMode] = useState<"existing" | "new">("existing");
  const [newGroupName, setNewGroupName] = useState("");
  const [entryGroupModes, setEntryGroupModes] = useState<Record<number, "existing" | "new">>({});
  const [entryNewGroupNames, setEntryNewGroupNames] = useState<Record<number, string>>({});

  useEffect(() => {
    if (savedConfig) {
      setEntries(savedConfig.addressRegistry);
      setExpanded({});
      const nextGroups: Record<string, boolean> = {};
      for (const entry of savedConfig.addressRegistry) {
        const groupName = entry.group?.trim() || "Custom";
        nextGroups[groupName] = true;
      }
      nextGroups.Custom = nextGroups.Custom ?? true;
      setExpandedGroups(nextGroups);
      setEntryGroupModes({});
      setEntryNewGroupNames({});
      setNewGroup("Custom");
      setNewGroupMode("existing");
      setNewGroupName("");
    }
  }, [savedConfig]);

  if (!savedConfig) return null;

  const isModified = JSON.stringify(entries) !== JSON.stringify(savedConfig.addressRegistry);

  const parseChainIds = (input: string): number[] | undefined => {
    const parsed = input
      .split(",")
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((num) => Number.isFinite(num) && num > 0);
    if (parsed.length === 0) return undefined;
    return Array.from(new Set(parsed));
  };

  const chainIdsText = (entry: AddressRegistryEntry): string => {
    if (!entry.chainIds || entry.chainIds.length === 0) return "";
    return entry.chainIds.join(", ");
  };

  const chainNamesText = (chainIds?: number[]): string => {
    if (!chainIds || chainIds.length === 0) return "All chains";
    return chainIds
      .map((id) => savedConfig.chains[String(id)]?.name ?? `Chain ${id}`)
      .join(", ");
  };

  const updateEntry = (i: number, updates: Partial<AddressRegistryEntry>) => {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...updates } : e)));

    // Keep target directory expanded while editing (especially when renaming/moving group).
    if (typeof updates.group === "string") {
      const nextGroup = updates.group.trim() || "Custom";
      setExpandedGroups((prev) => ({ ...prev, [nextGroup]: true }));
    }
  };

  const shiftIndexedModeMap = <T extends string>(
    source: Record<number, T>,
    removedIndex: number,
  ): Record<number, T> => {
    const next: Record<number, T> = {};
    for (const [key, value] of Object.entries(source)) {
      const idx = Number.parseInt(key, 10);
      if (idx < removedIndex) next[idx] = value;
      if (idx > removedIndex) next[idx - 1] = value;
    }
    return next;
  };

  const removeEntry = (i: number) => {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
    setExpanded((prev) => {
      const next: Record<number, boolean> = {};
      for (const [key, value] of Object.entries(prev)) {
        const idx = Number.parseInt(key, 10);
        if (idx < i) next[idx] = value;
        if (idx > i) next[idx - 1] = value;
      }
      return next;
    });
    setEntryGroupModes((prev) => shiftIndexedModeMap(prev, i));
    setEntryNewGroupNames((prev) => shiftIndexedModeMap(prev, i));
  };

  const toggleExpanded = (i: number) => {
    setExpanded((prev) => ({ ...prev, [i]: !prev[i] }));
  };

  const handleAdd = () => {
    if (!newAddress || !newName) return;
    const selectedGroup = newGroupMode === "new" ? newGroupName.trim() : newGroup.trim();
    if (newGroupMode === "new" && !selectedGroup) return;
    setEntries((prev) => [...prev, {
      address: newAddress,
      name: newName,
      kind: "eoa",
      group: selectedGroup || "Custom",
    }]);
    setNewAddress("");
    setNewName("");
    setExpandedGroups((prev) => ({ ...prev, [selectedGroup || "Custom"]: true }));
    setNewGroupMode("existing");
    setNewGroup(selectedGroup || "Custom");
    setNewGroupName("");
  };

  const handleSave = async () => {
    const updated: SettingsConfig = { ...savedConfig, addressRegistry: entries };
    try {
      await saveConfig(updated);
      toastSuccess("Registry saved", "Your address registry has been updated.");
    } catch {
      toastWarning("Save failed", "Could not persist settings to disk.");
    }
  };

  const handleDiscard = () => {
    setEntries(savedConfig.addressRegistry);
    setExpanded({});
    const nextGroups: Record<string, boolean> = {};
    for (const entry of savedConfig.addressRegistry) {
      const groupName = entry.group?.trim() || "Custom";
      nextGroups[groupName] = true;
    }
    nextGroups.Custom = nextGroups.Custom ?? true;
    setExpandedGroups(nextGroups);
    setEntryGroupModes({});
    setEntryNewGroupNames({});
    setNewGroup("Custom");
    setNewGroupMode("existing");
    setNewGroupName("");
  };

  const groupedEntries = entries.reduce<Record<string, Array<{ entry: AddressRegistryEntry; index: number }>>>((acc, entry, index) => {
    const groupName = entry.group?.trim() || "Custom";
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push({ entry, index });
    return acc;
  }, {});
  const orderedGroups = Object.keys(groupedEntries).sort((a, b) => a.localeCompare(b));
  const availableGroups = Array.from(
    new Set(entries.map((entry) => entry.group?.trim() || "Custom").concat("Custom"))
  ).sort((a, b) => a.localeCompare(b));

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-2 text-2xl font-bold">Address Registry</h2>
          <p className="text-muted">
            Label addresses for verification. Expand an entry to set chains, note, and type (EOA or contract).
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
          <CardTitle>Registry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 border-b border-border/15 pb-2">
            <Input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="0x..." className="flex-1 text-xs" />
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="w-40 text-xs" />
            <select
              value={newGroupMode === "new" ? "__new__" : (availableGroups.includes(newGroup) ? newGroup : "Custom")}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setNewGroupMode("new");
                  setNewGroupName("");
                } else {
                  setNewGroupMode("existing");
                  setNewGroup(e.target.value);
                }
              }}
              className="h-9 w-40 rounded border border-border/15 bg-surface-2/40 px-2 text-xs text-fg"
            >
              {availableGroups.map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
              <option value="__new__">+ Create new...</option>
            </select>
            {newGroupMode === "new" && (
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="New directory"
                className="w-40 text-xs"
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleAdd}
              disabled={!newAddress || !newName || (newGroupMode === "new" && !newGroupName.trim())}
              className="h-9 w-9 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {orderedGroups.map((groupName) => (
            <div key={groupName} className="rounded-md border border-border/15 glass-subtle">
              <button
                type="button"
                onClick={() => toggleGroup(groupName)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                {expandedGroups[groupName] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="text-sm font-medium">{groupName}</span>
                <span className="text-xs text-muted">({groupedEntries[groupName].length})</span>
              </button>

              {(expandedGroups[groupName] ?? true) && (
                <div className="space-y-2 border-t border-border/15 px-2 py-2">
                  {groupedEntries[groupName].map(({ entry, index: i }) => (
                    <div key={i} className="rounded-md border border-border/15 bg-surface-2/20 px-2 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(i)}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-surface-2/40"
                        >
                          {expanded[i] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                        <Input
                          value={entry.address}
                          onChange={(e) => updateEntry(i, { address: e.target.value })}
                          className="flex-1 text-xs font-mono"
                        />
                        <Input
                          value={entry.name}
                          onChange={(e) => updateEntry(i, { name: e.target.value })}
                          className="w-40 text-xs"
                        />
                        <Button variant="ghost" size="icon" onClick={() => removeEntry(i)} className="h-9 w-9 shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {expanded[i] && (
                        <div className="mt-2 space-y-2 border-t border-border/15 pt-2">
                          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                            <span className="text-xs text-muted">Directory</span>
                            <div className="space-y-2">
                              <select
                                value={(entryGroupModes[i] ?? "existing") === "new"
                                  ? "__new__"
                                  : (availableGroups.includes((entry.group?.trim() || "Custom")) ? (entry.group?.trim() || "Custom") : "Custom")}
                                onChange={(e) => {
                                  if (e.target.value === "__new__") {
                                    setEntryGroupModes((prev) => ({ ...prev, [i]: "new" }));
                                    setEntryNewGroupNames((prev) => ({ ...prev, [i]: "" }));
                                  } else {
                                    setEntryGroupModes((prev) => ({ ...prev, [i]: "existing" }));
                                    updateEntry(i, { group: e.target.value });
                                  }
                                }}
                                className="h-8 w-full rounded border border-border/15 bg-surface-2/40 px-2 text-xs text-fg"
                              >
                                {availableGroups.map((group) => (
                                  <option key={group} value={group}>{group}</option>
                                ))}
                                <option value="__new__">+ Create new...</option>
                              </select>
                              {(entryGroupModes[i] ?? "existing") === "new" && (
                                <Input
                                  value={entryNewGroupNames[i] ?? ""}
                                  onChange={(e) => {
                                    setEntryNewGroupNames((prev) => ({ ...prev, [i]: e.target.value }));
                                    updateEntry(i, { group: e.target.value });
                                  }}
                                  placeholder="New directory"
                                  className="text-xs"
                                />
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                            <span className="text-xs text-muted">Type</span>
                            <select
                              value={entry.kind}
                              onChange={(e) => updateEntry(i, { kind: e.target.value as "eoa" | "contract" })}
                              className="h-8 rounded border border-border/15 bg-surface-2/40 px-2 text-xs text-fg"
                            >
                              <option value="eoa">EOA</option>
                              <option value="contract">Contract</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                            <span className="text-xs text-muted">Note</span>
                            <Input
                              value={entry.note ?? ""}
                              onChange={(e) => updateEntry(i, { note: e.target.value || undefined })}
                              placeholder="Optional note"
                              className="text-xs"
                            />
                          </div>

                          <div className="grid grid-cols-[120px_1fr] items-start gap-2">
                            <span className="pt-2 text-xs text-muted">Chains</span>
                            <div>
                              <Input
                                value={chainIdDrafts[i] ?? chainIdsText(entry)}
                                onChange={(e) => setChainIdDrafts((prev) => ({ ...prev, [i]: e.target.value }))}
                                onBlur={() => {
                                  const raw = chainIdDrafts[i];
                                  if (raw === undefined) return;
                                  updateEntry(i, { chainIds: parseChainIds(raw) });
                                  setChainIdDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[i];
                                    return next;
                                  });
                                }}
                                placeholder="Chain IDs (optional)"
                                className="text-xs"
                              />
                              <p className="mt-1 text-[10px] text-muted">{chainNamesText(entry.chainIds)}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
