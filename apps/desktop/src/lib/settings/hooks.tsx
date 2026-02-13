import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { SettingsConfig } from "@safelens/core";
import { loadSettingsConfig, saveSettingsConfig, resetSettingsConfig } from "@safelens/core";
import { createTauriSettingsStore } from "./store";

interface SettingsContextValue {
  config: SettingsConfig | null;
  saveConfig: (config: SettingsConfig) => Promise<void>;
  resetConfig: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);
const settingsStore = createTauriSettingsStore();

export function SettingsConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SettingsConfig | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const loaded = await loadSettingsConfig(settingsStore);
      if (active) setConfig(loaded);
    })();

    return () => {
      active = false;
    };
  }, []);

  const saveConfig = useCallback(async (newConfig: SettingsConfig) => {
    await saveSettingsConfig(settingsStore, newConfig);
    setConfig(newConfig);
  }, []);

  const resetConfig = useCallback(async () => {
    const defaults = await resetSettingsConfig(settingsStore);
    setConfig(defaults);
  }, []);

  return (
    <SettingsContext.Provider value={{ config, saveConfig, resetConfig }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsConfig() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsConfig must be used within <SettingsConfigProvider>");
  return ctx;
}
