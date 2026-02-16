import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Library, ScrollText, Settings, Fingerprint } from "lucide-react";
import { computeConfigFingerprint, colorFromHash } from "@safelens/core";
import { useSettingsConfig } from "@/lib/settings/hooks";

const NAV_ITEMS = [
  { id: "verify", label: "Verify", icon: ShieldCheck, badge: undefined },
  { id: "address-book", label: "Registries", icon: Library, badge: undefined },
  { id: "erc7730", label: "Clear Signing", icon: ScrollText, badge: undefined },
  { id: "settings", label: "Settings", icon: Settings, badge: undefined },
] as const;

export type NavId = (typeof NAV_ITEMS)[number]["id"];

export function Sidebar({
  active,
  onNavigate,
}: {
  active: NavId;
  onNavigate: (id: NavId) => void;
}) {
  const { config } = useSettingsConfig();
  const [fp, setFp] = useState<{ color: string; hex: string }>({ color: "hsl(0, 0%, 50%)", hex: "00000000" });
  const [fpOpen, setFpOpen] = useState(false);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    computeConfigFingerprint(config).then((hash) => {
      if (!cancelled) setFp({ color: colorFromHash(hash), hex: hash.slice(0, 8) });
    });
    return () => { cancelled = true; };
  }, [config]);
  const asideRef = useRef<HTMLElement>(null);
  const blurDebugEnabled = import.meta.env.VITE_DEBUG_BLUR === "1";

  useEffect(() => {
    if (!blurDebugEnabled) return;
    if (!asideRef.current) return;
    const el = asideRef.current;
    let cleanup: (() => void) | undefined;
    import("@/lib/debug/blur-diagnostics").then(({ attachBlurDiagnostics }) => {
      cleanup = attachBlurDiagnostics(el);
    });
    return () => cleanup?.();
  }, [blurDebugEnabled]);

  return (
    <aside ref={asideRef} className="glass-sidebar flex h-full w-[220px] shrink-0 flex-col border-r border-white/[0.06]">
      {/* Spacer for macOS traffic lights (drag handled by App-level overlay) */}
      <div className="h-[52px] shrink-0" />

      <div className="px-5 pb-4">
        <h1 className="text-lg font-semibold tracking-tight">SafeLens</h1>
        <p className="text-xs text-muted">Offline verifier</p>
      </div>

      <nav className="relative flex flex-1 flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-white/[0.07] text-fg"
                  : "text-muted hover:bg-white/[0.04] hover:text-fg"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.badge != null && (
                <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] leading-none text-muted">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="relative px-3 py-3">
        <button
          type="button"
          onClick={() => setFpOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-lg border border-white/[0.10] px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
        >
          <Fingerprint
            className="h-4 w-4 shrink-0"
            style={{ color: fp.color }}
          />
          <div className="flex flex-col">
            <span className="text-[11px] text-muted/80">
              config: <span className="font-mono">{fp.hex}</span>
            </span>
            <span className="text-[10px] text-muted/50">version: 0.2.0</span>
          </div>
        </button>
        {fpOpen && (
          <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-muted/70">
            This color and hash uniquely identify your current settings configuration.
            Two devices with the same settings will show the same fingerprint.
          </div>
        )}
      </div>
    </aside>
  );
}
