import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeLens Generator",
  description: "Generate evidence packages for Safe multisig transactions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <div className="relative flex min-h-screen flex-col">
          <header className="sticky top-0 z-50 border-b border-border/[0.10] glass-subtle">
            <div className="container mx-auto flex h-16 items-center justify-between px-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">SafeLens</h1>
                <p className="text-xs text-muted">Evidence generator</p>
              </div>
              <a
                href="https://github.com/Th0rgal/safelens"
                className="text-xs font-medium text-muted hover:text-fg transition-colors"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
