import { useState, useRef, useEffect, useMemo } from "react";
import { Copy, ChevronRight, Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useSettingsConfig } from "@/lib/settings/hooks";
import { parseDescriptor, type ERC7730Descriptor, type Deployment } from "@safelens/core";

function chainLabel(chainId: number, chains?: Record<string, { name: string }>) {
  return chains?.[String(chainId)]?.name ?? `Chain ${chainId}`;
}

function getDeployments(d: ERC7730Descriptor) {
  return d.context.contract?.deployments ?? d.context.eip712?.deployments ?? [];
}

function groupByChain(deps: Deployment[]) {
  const map = new Map<number, string[]>();
  for (const d of deps) {
    const arr = map.get(d.chainId) ?? [];
    arr.push(d.address);
    map.set(d.chainId, arr);
  }
  return map;
}

interface DescriptorListItem {
  descriptor: ERC7730Descriptor;
  index: number;
}

interface DescriptorGroup {
  key: string;
  label: string;
  items: DescriptorListItem[];
}

function getGroupIdentity(descriptor: ERC7730Descriptor) {
  const owner = descriptor.metadata.owner.trim();
  const ownerToken = owner.split(/[\s-]/)[0] ?? owner;

  return {
    key: ownerToken.toLowerCase(),
    label: ownerToken,
  };
}

function groupDescriptors(descriptors: ERC7730Descriptor[]): DescriptorGroup[] {
  const map = new Map<string, DescriptorGroup>();

  descriptors.forEach((descriptor, index) => {
    const identity = getGroupIdentity(descriptor);
    const existing = map.get(identity.key);
    const item = { descriptor, index };

    if (existing) {
      existing.items.push(item);
      return;
    }

    map.set(identity.key, {
      key: identity.key,
      label: identity.label,
      items: [item],
    });
  });

  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function CopyableAddress({ address, onCopy }: { address: string; onCopy: (addr: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(address);
        onCopy(address);
      }}
      className="group inline-flex items-center gap-1.5 font-mono hover:text-fg transition-colors text-left"
    >
      <span className="break-all">{address}</span>
      <Copy className="h-3 w-3 shrink-0 opacity-30 group-hover:opacity-70 transition-opacity" />
    </button>
  );
}

function ExpandableSignature({ sig }: { sig: string }) {
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) setIsTruncated(el.scrollWidth > el.clientWidth);
  }, [sig]);

  return (
    <button
      type="button"
      onClick={() => isTruncated && setExpanded((v) => !v)}
      className={`flex items-start gap-1 text-left ${isTruncated ? "cursor-pointer" : "cursor-default"}`}
    >
      {isTruncated && (
        <ChevronRight className={`mt-px h-3 w-3 shrink-0 text-muted/50 transition-transform ${expanded ? "rotate-90" : ""}`} />
      )}
      <span
        ref={ref}
        className={`font-mono text-muted/50 ${expanded ? "break-all" : "truncate"}`}
      >
        {sig}
      </span>
    </button>
  );
}

const BUILT_IN_INTERPRETERS = [
  {
    id: "cowswap-twap",
    protocol: "CoW Swap",
    action: "TWAP Order",
    description: "Decodes Time-Weighted Average Price orders created via CoW Protocol's Composable Order Framework.",
  },
  {
    id: "safe-policy",
    protocol: "Safe",
    action: "Policy Change",
    description: "Detects owner additions, removals, swaps, and threshold changes on the Safe itself.",
  },
] as const;

export default function ERC7730Screen() {
  const { config, saveConfig } = useSettingsConfig();
  const { success, severe } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const descriptors = useMemo(
    () => (config?.erc7730Descriptors ?? []) as unknown as ERC7730Descriptor[],
    [config?.erc7730Descriptors],
  );
  const groupedDescriptors = useMemo(() => groupDescriptors(descriptors), [descriptors]);
  const disabledInterpreters = config?.disabledInterpreters ?? [];

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next: Record<string, boolean> = {};
      for (const group of groupedDescriptors) {
        next[group.key] = prev[group.key] ?? false;
      }
      return next;
    });
  }, [groupedDescriptors]);

  const toggleInterpreter = async (id: string) => {
    if (!config) return;
    const disabled = config.disabledInterpreters ?? [];
    const updated = disabled.includes(id)
      ? disabled.filter((x) => x !== id)
      : [...disabled, id];
    await saveConfig({ ...config, disabledInterpreters: updated });
  };

  const handleCopy = (addr: string) => {
    success("Copied", addr);
  };

  const handleDelete = async (index: number) => {
    if (!config) return;
    const updated = config.erc7730Descriptors.filter((_, i) => i !== index);
    await saveConfig({ ...config, erc7730Descriptors: updated });
    success("Removed", "Descriptor deleted");
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !config) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const result = parseDescriptor(json);

      if (!result.success) {
        severe("Invalid descriptor", result.error);
        return;
      }

      await saveConfig({
        ...config,
        erc7730Descriptors: [...config.erc7730Descriptors, json],
      });
      success("Imported", result.descriptor.metadata.owner);
    } catch {
      severe("Import failed", "File is not valid JSON");
    } finally {
      // Reset input so the same file can be re-selected
      e.target.value = "";
    }
  };

  return (
    <>
      <h2 className="mb-1 text-xl font-semibold tracking-tight">Clear Signing</h2>
      <p className="mb-6 text-sm text-muted">
        Import ERC-7730 descriptor JSON files to enable clear signing for known contracts.
      </p>

      <div className="flex flex-col gap-3 mb-6">
        <p className="text-xs font-medium text-muted">Built-in interpreters</p>
        {BUILT_IN_INTERPRETERS.map((interp) => {
          const isDisabled = disabledInterpreters.includes(interp.id);
          return (
            <Card key={interp.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{interp.protocol}</span>
                    <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-muted">
                      {interp.action}
                    </span>
                  </div>
                  <p className="text-xs text-muted/60">{interp.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleInterpreter(interp.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isDisabled
                      ? "bg-white/[0.06] text-muted hover:bg-white/[0.1]"
                      : "bg-accent/20 text-accent hover:bg-accent/30"
                  }`}
                >
                  {isDisabled ? "Disabled" : "Enabled"}
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-xs font-medium text-muted">ERC-7730 descriptors</p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 py-3 text-sm text-muted hover:border-white/20 hover:text-fg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Import ERC-7730 descriptor
        </button>

        {groupedDescriptors.map((group) => {
          const expanded = expandedGroups[group.key] ?? false;

          return (
            <Card key={group.key}>
              <CardHeader className="pb-4">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between rounded-md px-1 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ChevronRight className={`h-4 w-4 shrink-0 text-muted/60 transition-transform ${expanded ? "rotate-90" : ""}`} />
                    <span className="truncate text-sm font-medium">{group.label}</span>
                  </div>
                  <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-normal text-muted">
                    {group.items.length} {group.items.length === 1 ? "descriptor" : "descriptors"}
                  </span>
                </button>
              </CardHeader>

              {expanded && (
                <CardContent className="space-y-3">
                  {group.items.map(({ descriptor: desc, index }) => {
                    const deployments = getDeployments(desc);
                    const chainGroups = groupByChain(deployments);
                    const methods = Object.entries(desc.display.formats);
                    const token = desc.metadata.token;

                    return (
                      <div key={index} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{desc.metadata.owner}</span>
                              {token && (
                                <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-muted">
                                  {token.ticker}
                                </span>
                              )}
                            </div>
                            {desc.metadata.info?.legalName && (
                              <p className="text-xs text-muted/60">{desc.metadata.info.legalName}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {desc.metadata.info?.url && (
                              <span className="max-w-40 truncate text-xs text-muted">{desc.metadata.info.url}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelete(index)}
                              className="rounded-md p-1 text-muted/40 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
                              title="Remove descriptor"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-3 text-sm">
                          {chainGroups.size > 0 && (
                            <div>
                              <p className="mb-1.5 text-xs font-medium text-muted">Contracts</p>
                              <div className="flex flex-col gap-1.5">
                                {[...chainGroups.entries()].map(([chainId, addresses]) => (
                                  <div
                                    key={chainId}
                                    className="flex items-center gap-2 rounded-md bg-white/[0.05] px-2.5 py-1.5 text-xs"
                                  >
                                    <span className="shrink-0 text-muted">on {chainLabel(chainId, config?.chains)}</span>
                                    <div className="flex flex-wrap gap-x-3">
                                      {addresses.map((addr) => (
                                        <CopyableAddress key={addr} address={addr} onCopy={handleCopy} />
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {methods.length > 0 && (
                            <div>
                              <p className="mb-1.5 text-xs font-medium text-muted">Recognized actions</p>
                              <div className="flex flex-col gap-1">
                                {methods.map(([sig, entry]) => (
                                  <div
                                    key={sig}
                                    className="flex flex-col gap-0.5 rounded-md bg-white/[0.05] px-2.5 py-1.5 text-xs"
                                  >
                                    <span>{entry.intent}</span>
                                    <ExpandableSignature sig={sig} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

    </>
  );
}
