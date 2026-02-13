import { useState } from "react";
import { SettingsConfigProvider } from "./lib/settings/hooks";
import { ToastProvider } from "./components/ui/toast";
import { Sidebar, type NavId } from "./components/sidebar";
import VerifyScreen from "./screens/VerifyScreen";
import SettingsScreen from "./screens/SettingsScreen";

export default function App() {
  const [active, setActive] = useState<NavId>("verify");

  return (
    <SettingsConfigProvider>
      <ToastProvider>
        <div className="flex h-screen w-full overflow-hidden">
          <Sidebar active={active} onNavigate={setActive} />
          <main className="flex-1 min-w-0 overflow-y-auto bg-bg">
            <div className="px-8 pt-14 pb-8">
              {active === "verify" ? <VerifyScreen /> : <SettingsScreen />}
            </div>
          </main>
        </div>
      </ToastProvider>
    </SettingsConfigProvider>
  );
}
