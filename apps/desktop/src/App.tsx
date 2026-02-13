import { useState } from "react";
import { SettingsConfigProvider } from "./lib/settings/hooks";
import { ToastProvider } from "./components/ui/toast";
import VerifyScreen from "./screens/VerifyScreen";
import SettingsScreen from "./screens/SettingsScreen";

const TABS = [
  { id: "verify", label: "Verify" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const [active, setActive] = useState<TabId>("verify");

  return (
    <SettingsConfigProvider>
      <ToastProvider>
        <div className="min-h-screen">
          <header className="sticky top-0 z-50 border-b border-border/[0.10] glass-subtle">
            <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">SafeLens</h1>
                <p className="text-xs text-muted">Offline verifier</p>
              </div>
              <nav className="flex items-center gap-2">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActive(tab.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      active === tab.id
                        ? "bg-accent/20 text-accent"
                        : "text-muted hover:text-fg"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>
          </header>

          <main className="mx-auto max-w-5xl px-4 py-8">
            {active === "verify" ? <VerifyScreen /> : <SettingsScreen />}
          </main>
        </div>
      </ToastProvider>
    </SettingsConfigProvider>
  );
}
