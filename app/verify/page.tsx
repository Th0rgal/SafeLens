"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { parseEvidencePackage } from "@/lib/package/validator";
import { getChainName } from "@/lib/safe/url-parser";
import type { EvidencePackage } from "@/lib/types";

export default function VerifyPage() {
  const [jsonInput, setJsonInput] = useState("");
  const [evidence, setEvidence] = useState<EvidencePackage | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [verified, setVerified] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setJsonInput(text);
    } catch (err) {
      setErrors(["Failed to read file"]);
    }
  };

  const handleVerify = () => {
    setEvidence(null);
    setErrors([]);
    setVerified(false);

    const result = parseEvidencePackage(jsonInput);

    if (result.valid && result.evidence) {
      setEvidence(result.evidence);
      setVerified(true);
    } else {
      setErrors(result.errors);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Verify Evidence Package</h1>
        <p className="text-gray-600">
          Upload or paste an evidence package to verify its authenticity
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Upload Evidence</CardTitle>
          <CardDescription>
            Upload a JSON file or paste the evidence package content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Upload File</label>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-900/90"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Or Paste JSON</label>
            <Textarea
              placeholder='{"version": "1.0", "safeAddress": "0x...", ...}'
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="min-h-[200px] font-mono text-xs"
            />
          </div>

          <Button onClick={handleVerify} disabled={!jsonInput} className="w-full">
            Verify Evidence
          </Button>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Verification Failed</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {verified && evidence && (
        <div className="space-y-6">
          <Alert className="border-green-500 bg-green-50">
            <AlertTitle className="text-green-900">✓ Verification Successful</AlertTitle>
            <AlertDescription className="text-green-800">
              The evidence package is valid and the Safe transaction hash has been successfully recomputed and verified.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Transaction Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm font-medium text-gray-500">Chain</div>
                  <div className="font-mono text-sm">{getChainName(evidence.chainId)}</div>
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-gray-500">Safe Address</div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs">{evidence.safeAddress}</code>
                    <button
                      onClick={() => copyToClipboard(evidence.safeAddress)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-sm font-medium text-gray-500">Safe TX Hash</div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs">{evidence.safeTxHash}</code>
                    <button
                      onClick={() => copyToClipboard(evidence.safeTxHash)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {evidence.ethereumTxHash && (
                  <div className="md:col-span-2">
                    <div className="mb-1 text-sm font-medium text-gray-500">Ethereum TX Hash</div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs">{evidence.ethereumTxHash}</code>
                      <button
                        onClick={() => copyToClipboard(evidence.ethereumTxHash!)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transaction Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-500">Target Contract:</span>
                  <code className="text-xs">{evidence.transaction.to}</code>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-gray-500">Value:</span>
                  <code className="text-xs">{evidence.transaction.value} wei</code>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-gray-500">Operation:</span>
                  <span>{evidence.transaction.operation === 0 ? "Call" : "DelegateCall"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-gray-500">Nonce:</span>
                  <span>{evidence.transaction.nonce}</span>
                </div>
                {evidence.transaction.data && (
                  <div>
                    <div className="mb-1 font-medium text-gray-500">Calldata:</div>
                    <code className="block break-all rounded bg-gray-100 p-2 text-xs">
                      {evidence.transaction.data}
                    </code>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Signatures</CardTitle>
              <CardDescription>
                {evidence.confirmations.length} of {evidence.confirmationsRequired} required signatures
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {evidence.confirmations.map((conf, i) => (
                  <div key={i} className="rounded border border-gray-200 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">Owner {i + 1}</span>
                      <span className="text-xs text-gray-500">{new Date(conf.submissionDate).toLocaleString()}</span>
                    </div>
                    <code className="block text-xs text-gray-700">{conf.owner}</code>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
                        Show signature
                      </summary>
                      <code className="mt-1 block break-all text-xs text-gray-600">
                        {conf.signature}
                      </code>
                    </details>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sources of Truth</CardTitle>
              <CardDescription>
                Data sources used to create this evidence package
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="font-medium text-gray-500">Safe API:</div>
                  <a
                    href={evidence.sources.safeApiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {evidence.sources.safeApiUrl}
                  </a>
                </div>
                <div>
                  <div className="font-medium text-gray-500">Transaction URL:</div>
                  <a
                    href={evidence.sources.transactionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-blue-600 hover:underline"
                  >
                    {evidence.sources.transactionUrl}
                  </a>
                </div>
                <div>
                  <div className="font-medium text-gray-500">Packaged At:</div>
                  <span>{new Date(evidence.packagedAt).toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
