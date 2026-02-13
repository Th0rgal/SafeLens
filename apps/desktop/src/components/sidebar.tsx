import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, Library, Settings, Fingerprint } from "lucide-react";
import { useSettingsConfig } from "@/lib/settings/hooks";
import { attachBlurDiagnostics } from "@/lib/debug/blur-diagnostics";

const NAV_ITEMS = [
  { id: "verify", label: "Verify", icon: ShieldCheck },
  { id: "address-book", label: "Registries", icon: Library },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

export type NavId = (typeof NAV_ITEMS)[number]["id"];

/** Derive a deterministic hash from a settings object. Returns [hue 0-360, hex string]. */
function settingsFingerprint(config: unknown): { hue: number; hex: string } {
  const str = JSON.stringify(config);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  const hue = ((h % 360) + 360) % 360;
  const hex = ((h >>> 0).toString(16)).padStart(8, "0");
  return { hue, hex };
}

export function Sidebar({
  active,
  onNavigate,
}: {
  active: NavId;
  onNavigate: (id: NavId) => void;
}) {
  const { config } = useSettingsConfig();
  const fp = useMemo(() => settingsFingerprint(config), [config]);
  const [fpOpen, setFpOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const blurDebugEnabled = import.meta.env.VITE_DEBUG_BLUR === "1";

  useEffect(() => {
    if (!blurDebugEnabled) return;
    if (!asideRef.current) return;
    return attachBlurDiagnostics(asideRef.current);
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
              {item.label}
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
            style={{ color: `hsl(${fp.hue}, 60%, 55%)` }}
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
