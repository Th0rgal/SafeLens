"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { SettingsConfig } from "./types";
import { loadSettingsConfig, saveSettingsConfig, resetSettingsConfig as resetStore } from "./store";

/* ------------------------------------------------------------------ */
/*  Context — single source of truth for the saved config              */
/* ------------------------------------------------------------------ */

interface SettingsContextValue {
  config: SettingsConfig | null;
  saveConfig: (config: SettingsConfig) => void;
  resetConfig: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SettingsConfig | null>(null);

  useEffect(() => {
    setConfig(loadSettingsConfig());
  }, []);

  const saveConfig = useCallback((newConfig: SettingsConfig) => {
    saveSettingsConfig(newConfig);
    setConfig(newConfig);
  }, []);

  const resetConfig = useCallback(() => {
    const defaults = resetStore();
    setConfig(defaults);
  }, []);

  return (
    <SettingsContext.Provider value={{ config, saveConfig, resetConfig }}>
      {children}
    </SettingsContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook — reads from context, used by fingerprint, address display    */
/* ------------------------------------------------------------------ */

export function useSettingsConfig() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsConfig must be used within <SettingsConfigProvider>");
  return ctx;
}
