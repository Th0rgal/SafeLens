import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  parseEvidencePackage,
  getChainName,
  verifyEvidencePackage,
} from "@safelens/core";
import { TrustBadge } from "@/components/trust-badge";
import { InterpretationCard } from "@/components/interpretation-card";
import { CallArray } from "@/components/call-array";
import { AddressDisplay } from "@/components/address-display";
import { useSettingsConfig } from "@/lib/settings/hooks";
import { ShieldCheck, AlertTriangle, HelpCircle, UserRound, Upload, ChevronRight } from "lucide-react";
import type { EvidencePackage, SignatureCheckResult, TransactionWarning, TrustLevel } from "@safelens/core";

const WARNING_STYLES: Record<string, { border: string; bg: string; text: string; Icon: typeof AlertTriangle }> = {
  info: { border: "border-blue-500/20", bg: "bg-blue-500/10", text: "text-blue-400", Icon: HelpCircle },
  warning: { border: "border-amber-500/20", bg: "bg-amber-500/10", text: "text-amber-400", Icon: AlertTriangle },
  danger: { border: "border-red-500/20", bg: "bg-red-500/10", text: "text-red-400", Icon: AlertTriangle },
};

function WarningBanner({ warning, className }: { warning: TransactionWarning; className?: string }) {
  const style = WARNING_STYLES[warning.level];
  const { Icon } = style;
  return (
    <div className={`flex items-center gap-2 rounded-md border ${style.border} ${style.bg} px-3 py-2 text-xs ${style.text} ${className ?? ""}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{warning.message}</span>
    </div>
  );
}

export default function VerifyScreen() {
  const [jsonInput, setJsonInput] = useState("");
  const [evidence, setEvidence] = useState<EvidencePackage | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [verified, setVerified] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(true);
  const [sigResults, setSigResults] = useState<Record<string, SignatureCheckResult>>({});
  const [proposer, setProposer] = useState<string | null>(null);
  const [targetWarnings, setTargetWarnings] = useState<TransactionWarning[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { config } = useSettingsConfig();
  const { success: toastSuccess } = useToast();

  useEffect(() => {
    const currentEvidence = evidence;

    if (!currentEvidence) {
      setSigResults({});
      setProposer(null);
      setTargetWarnings([]);
      return;
    }

    setSigResults({});
    setProposer(null);
    setTargetWarnings([]);

    let cancelled = false;

    async function verifyAll() {
      if (!currentEvidence) return;
      const report = await verifyEvidencePackage(currentEvidence, {
        settings: config ?? null,
      });

      if (cancelled) return;
      setSigResults(report.signatures.byOwner);
      setProposer(report.proposer);
      setTargetWarnings(report.targetWarnings);
    }

    verifyAll();
    return () => {
      cancelled = true;
    };
  }, [evidence, config]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setJsonInput(text);
    } catch {
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
      setUploadOpen(false);
      toastSuccess(
        "Verification Successful",
        "The evidence package is valid and the Safe transaction hash has been successfully recomputed and verified."
      );
    } else {
      setErrors(result.errors);
    }
  };

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const signatureResults = Object.values(sigResults);
  const signaturesTrustLevel: TrustLevel =
    signatureResults.length === 0
      ? "api-sourced"
      : signatureResults.some((result) => result.status === "unsupported")
        ? "api-sourced"
        : "self-verified";

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h2 className="mb-2 text-2xl font-bold">Verify Evidence</h2>
        <p className="text-muted">
          Verify an evidence package offline. All hashes are recomputed locally.
        </p>
      </div>

      {uploadOpen ? (
        <Card className="mb-6">
          <CardHeader className="cursor-pointer select-none" onClick={() => setUploadOpen(false)}>
            <CardTitle>Upload Evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Upload File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full justify-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Choose File
                </Button>
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
            </div>
          </CardContent>
        </Card>
      ) : (
        <button
          onClick={() => setUploadOpen(true)}
          className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-fg transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          Upload Evidence
        </button>
      )}

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
          {evidence.dataDecoded && (
            <InterpretationCard
              dataDecoded={evidence.dataDecoded}
              txTo={evidence.transaction.to}
              txOperation={evidence.transaction.operation}
              context={{
                currentThreshold: evidence.confirmationsRequired,
              }}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Transaction Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
                    Chain <TrustBadge level="self-verified" />
                  </div>
                  <div className="font-mono text-sm">{getChainName(evidence.chainId)}</div>
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
                    Safe Address <TrustBadge level="self-verified" />
                  </div>
                  <AddressDisplay address={evidence.safeAddress} />
                </div>

                {proposer && (
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
                      <UserRound className="h-3.5 w-3.5" />
                      Proposed by
                    </div>
                    <AddressDisplay address={proposer} />
                  </div>
                )}

                <div className="md:col-span-2">
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
                    Safe TX Hash <TrustBadge level="self-verified" />
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs">{evidence.safeTxHash}</code>
                    <button
                      onClick={() => copyToClipboard(evidence.safeTxHash, "safeTxHash")}
                      className="text-xs text-accent hover:text-accent-hover"
                    >
                      {copiedField === "safeTxHash" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {evidence.ethereumTxHash && (
                  <div className="md:col-span-2">
                    <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
                      Ethereum TX Hash <TrustBadge level="api-sourced" />
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs">{evidence.ethereumTxHash}</code>
                      <button
                        onClick={() => copyToClipboard(evidence.ethereumTxHash!, "ethTxHash")}
                        className="text-xs text-accent hover:text-accent-hover"
                      >
                        {copiedField === "ethTxHash" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Signatures</CardTitle>
                <TrustBadge level={signaturesTrustLevel} />
              </div>
              <CardDescription>
                {evidence.confirmations.length} of {evidence.confirmationsRequired} required signatures
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {evidence.confirmations.map((conf, i) => {
                  const sigResult = sigResults[conf.owner];
                  return (
                    <div key={i} className="rounded-md border border-border/15 glass-subtle p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted">Owner {i + 1}</span>
                          {sigResult ? (
                            sigResult.status === "valid" ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-400" title="Signature verified locally">
                                <ShieldCheck className="h-3 w-3" />
                                Verified
                              </span>
                            ) : sigResult.status === "invalid" ? (
                              <span className="inline-flex items-center gap-1 text-xs text-red-400" title={`Recovered: ${sigResult.recoveredSigner}`}>
                                <AlertTriangle className="h-3 w-3" />
                                Invalid
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-400" title={sigResult.reason}>
                                <HelpCircle className="h-3 w-3" />
                                {sigResult.reason}
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-muted">Verifying…</span>
                          )}
                        </div>
                        <span className="text-xs text-muted">{new Date(conf.submissionDate).toLocaleString()}</span>
                      </div>
                      <AddressDisplay address={conf.owner} />
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-accent hover:text-accent-hover">
                          Show signature
                        </summary>
                        <code className="mt-1 block break-all text-xs text-muted">
                          {conf.signature}
                        </code>
                      </details>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transaction Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium text-muted">
                    Target Contract <TrustBadge level="self-verified" />
                  </span>
                  <AddressDisplay address={evidence.transaction.to} />
                </div>
                {targetWarnings.map((w, i) => (
                  <WarningBanner key={i} warning={w} />
                ))}
                <div className="flex justify-between">
                  <span className="flex items-center gap-2 font-medium text-muted">
                    Value <TrustBadge level="self-verified" />
                  </span>
                  <code className="text-xs">{evidence.transaction.value} wei</code>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2 font-medium text-muted">
                    Operation <TrustBadge level="self-verified" />
                  </span>
                  <span>{evidence.transaction.operation === 0 ? "Call" : "DelegateCall"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2 font-medium text-muted">
                    Nonce <TrustBadge level="self-verified" />
                  </span>
                  <span>{evidence.transaction.nonce}</span>
                </div>
                {evidence.dataDecoded && (
                  <CallArray
                    dataDecoded={evidence.dataDecoded}
                    txTo={evidence.transaction.to}
                    txValue={evidence.transaction.value}
                    txOperation={evidence.transaction.operation}
                    txData={evidence.transaction.data}
                  />
                )}
                {evidence.transaction.data && (
                  <div>
                    <div className="mb-1 flex items-center gap-2 font-medium text-muted">
                      Calldata <TrustBadge level="self-verified" />
                    </div>
                    <code className="block break-all rounded-md border border-border/15 glass-subtle p-2 text-xs">
                      {evidence.transaction.data}
                    </code>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
