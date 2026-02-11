import type { Metadata } from "next";
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
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-gray-200 bg-white">
            <div className="container mx-auto flex h-16 items-center px-4">
              <h1 className="text-xl font-bold">SafeLens</h1>
              <nav className="ml-8 flex gap-6">
                <a
                  href="/analyze"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  Analyze
                </a>
                <a
                  href="/verify"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  Verify
                </a>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
