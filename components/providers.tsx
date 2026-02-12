"use client";

import { ToastProvider } from "@/components/ui/toast";
import { SettingsConfigProvider } from "@/lib/settings";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsConfigProvider>
      <ToastProvider>{children}</ToastProvider>
    </SettingsConfigProvider>
  );
}
