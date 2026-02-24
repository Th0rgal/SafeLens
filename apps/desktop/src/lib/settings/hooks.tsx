import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import type { SettingsConfig, SettingsLoadWarning } from "@safelens/core";
import { loadSettingsConfig, saveSettingsConfig, resetSettingsConfig, setGlobalDescriptors } from "@safelens/core";
import { createTauriSettingsStore } from "./store";

interface SettingsContextValue {
  config: SettingsConfig | null;
  loadWarning: SettingsLoadWarning | undefined;
  saveConfig: (config: SettingsConfig) => Promise<void>;
  resetConfig: () => Promise<void>;
  dismissWarning: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);
const settingsStore = createTauriSettingsStore();

export function SettingsConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SettingsConfig | null>(null);
  const [loadWarning, setLoadWarning] = useState<SettingsLoadWarning | undefined>();

  useEffect(() => {
    let active = true;
    (async () => {
      const { config: loaded, warning } = await loadSettingsConfig(settingsStore);
      if (active) {
        setConfig(loaded);
        setLoadWarning(warning);
        setGlobalDescriptors(loaded.erc7730Descriptors ?? []);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const saveConfig = useCallback(async (newConfig: SettingsConfig) => {
    setConfig(newConfig);
    setLoadWarning(undefined);
    setGlobalDescriptors(newConfig.erc7730Descriptors ?? []);
    await saveSettingsConfig(settingsStore, newConfig);
  }, []);

  const resetConfig = useCallback(async () => {
    const defaults = await resetSettingsConfig(settingsStore);
    setConfig(defaults);
    setLoadWarning(undefined);
    setGlobalDescriptors(defaults.erc7730Descriptors ?? []);
  }, []);

  const dismissWarning = useCallback(() => {
    setLoadWarning(undefined);
  }, []);

  const value = useMemo(
    () => ({ config, loadWarning, saveConfig, resetConfig, dismissWarning }),
    [config, loadWarning, saveConfig, resetConfig, dismissWarning],
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
