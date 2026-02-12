import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { ConfigFingerprint } from "@/components/config-fingerprint";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeLens - Verify Safe Multisig Transactions",
  description: "Analyze and verify Gnosis Safe multisig transactions with full transparency",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <header className="sticky top-0 z-50 border-b border-border/[0.06] glass-subtle">
              <div className="container mx-auto flex h-16 items-center px-4">
                <h1 className="text-xl font-semibold tracking-tight">SafeLens</h1>
                <nav className="ml-8 flex gap-6">
                  <a
                    href="/analyze"
                    className="text-sm font-medium text-muted hover:text-fg transition-colors"
                  >
                    Analyze
                  </a>
                  <a
                    href="/verify"
                    className="text-sm font-medium text-muted hover:text-fg transition-colors"
                  >
                    Verify
                  </a>
                  <a
                    href="/settings"
                    className="text-sm font-medium text-muted hover:text-fg transition-colors"
                  >
                    Settings
                  </a>
                </nav>
                <ConfigFingerprint />
              </div>
            </header>
            <main className="flex-1">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
