import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
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
    setConfig(newConfig);
    try {
      await saveSettingsConfig(settingsStore, newConfig);
    } catch {
      // Persistence may fail in dev mode — in-memory state is still updated
    }
  }, []);

  const resetConfig = useCallback(async () => {
    const defaults = await resetSettingsConfig(settingsStore);
    setConfig(defaults);
  }, []);

  const value = useMemo(
    () => ({ config, saveConfig, resetConfig }),
    [config, saveConfig, resetConfig],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsConfig() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsConfig must be used within <SettingsConfigProvider>");
  return ctx;
}
