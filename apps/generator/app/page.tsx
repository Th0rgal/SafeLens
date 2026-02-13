"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { parseSafeUrl, getChainName, fetchSafeTransaction, createEvidencePackage } from "@safelens/core";
import { downloadEvidencePackage } from "@/lib/download";
import { AddressDisplay } from "@/components/address-display";
import type { EvidencePackage } from "@safelens/core";

export default function AnalyzePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidencePackage | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAnalyze = async () => {
    setError(null);
    setEvidence(null);
    setLoading(true);

    try {
      const urlData = parseSafeUrl(url);
      const tx = await fetchSafeTransaction(urlData.chainId, urlData.safeTxHash);
      const pkg = createEvidencePackage(tx, urlData.chainId, url);
      setEvidence(pkg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze transaction");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (evidence) {
      downloadEvidencePackage(evidence);
    }
  };

  const handleCopy = useCallback(() => {
    if (evidence) {
      navigator.clipboard.writeText(JSON.stringify(evidence, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [evidence]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Generate Evidence</h1>
        <p className="text-muted">
          Paste a Safe transaction URL to build a portable evidence package.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Transaction URL</CardTitle>
          <CardDescription>
            Paste the URL from app.safe.global (e.g., https://app.safe.global/transactions/tx?safe=eth:0x...&id=multisig_...)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="https://app.safe.global/transactions/tx?safe=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleAnalyze} disabled={loading || !url}>
              {loading ? "Analyzing..." : "Analyze"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {evidence && (
        <Card>
          <CardHeader>
            <CardTitle>Evidence Package</CardTitle>
            <CardDescription>
              Transaction successfully analyzed and evidence package created.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium text-muted">Chain</div>
                <div className="font-mono">{getChainName(evidence.chainId)}</div>
              </div>
              <div>
                <div className="font-medium text-muted">Safe Address</div>
                <AddressDisplay address={evidence.safeAddress} />
              </div>
              <div>
                <div className="font-medium text-muted">Safe TX Hash</div>
                <div className="font-mono text-xs">{evidence.safeTxHash}</div>
              </div>
              <div>
                <div className="font-medium text-muted">Nonce</div>
                <div className="font-mono">{evidence.transaction.nonce}</div>
              </div>
              <div>
                <div className="font-medium text-muted">Signatures</div>
                <div className="font-mono">
                  {evidence.confirmations.length} / {evidence.confirmationsRequired}
                </div>
              </div>
              <div>
                <div className="font-medium text-muted">Target</div>
                <AddressDisplay address={evidence.transaction.to} />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleDownload} className="flex-1">
                Download JSON
              </Button>
              <Button onClick={handleCopy} variant="outline" className="flex-1">
                {copied ? "Copied!" : "Copy to Clipboard"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
