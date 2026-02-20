import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  parseEvidencePackage,
  getChainName,
  getNetworkCapability,
  verifyEvidencePackage,
  applyConsensusVerificationToReport,
  decodeSimulationEvents,
} from "@safelens/core";
import type { DecodedEvent } from "@safelens/core";
import { TrustBadge } from "@/components/trust-badge";
import { InterpretationCard } from "@/components/interpretation-card";
import { CallArray } from "@/components/call-array";
import { AddressDisplay } from "@/components/address-display";
import { HashVerificationDetails } from "@/components/hash-verification-details";
import { useSettingsConfig } from "@/lib/settings/hooks";
import { ShieldCheck, AlertTriangle, HelpCircle, UserRound, Upload, ChevronRight, ArrowUpRight, ArrowDownLeft, Repeat, KeyRound, ChevronDown } from "lucide-react";
import type { EvidencePackage, SignatureCheckResult, TransactionWarning, TrustLevel, SafeTxHashDetails, PolicyProofVerificationResult, SimulationVerificationResult, ConsensusVerificationResult } from "@safelens/core";
import { invoke } from "@tauri-apps/api/core";

type ConsensusProofVerifyInput = EvidencePackage["consensusProof"] extends infer T
  ? T extends object
    ? T & {
        expectedStateRoot: string;
        packageChainId: number;
        packagePackagedAt?: string;
      }
    : never
  : never;

const WARNING_STYLES: Record<string, { border: string; bg: string; text: string; Icon: typeof AlertTriangle }> = {
  info: { border: "border-blue-500/20", bg: "bg-blue-500/10", text: "text-blue-400", Icon: HelpCircle },
  warning: { border: "border-amber-500/20", bg: "bg-amber-500/10", text: "text-amber-400", Icon: AlertTriangle },
  danger: { border: "border-red-500/20", bg: "bg-red-500/10", text: "text-red-400", Icon: AlertTriangle },
};

const SIMULATION_REASON_LABELS = {
  "missing-rpc-url": "Simulation was skipped because no RPC URL was configured during package generation.",
  "simulation-fetch-failed": "Simulation could not be fetched during package generation.",
  "missing-simulation": "No simulation result was included in this package.",
} as const;

type SimulationReasonCode = keyof typeof SIMULATION_REASON_LABELS;
const SIMULATION_REASON_CODES: SimulationReasonCode[] = [
  "missing-rpc-url",
  "simulation-fetch-failed",
  "missing-simulation",
];

function getSimulationUnavailableReason(evidence: EvidencePackage): string {
  const exportReasons = evidence.exportContract?.reasons ?? [];
  const matchedReason = SIMULATION_REASON_CODES.find((code) =>
    exportReasons.includes(code)
  );
  if (matchedReason) return SIMULATION_REASON_LABELS[matchedReason];

  const capability = getNetworkCapability(evidence.chainId);
  if (capability && !capability.supportsSimulation) {
    return "Simulation is not available for this network in SafeLens yet.";
  }

  return "No simulation result is available in this evidence package.";
}

function getNetworkSupportStatus(chainId: number): {
  isFullySupported: boolean;
  badgeText: string;
  helperText: string | null;
} {
  const capability = getNetworkCapability(chainId);
  if (!capability) {
    return {
      isFullySupported: false,
      badgeText: "Partial",
      helperText: "Partially supported: this network is unknown to SafeLens capabilities.",
    };
  }

  const hasConsensus = Boolean(capability.consensus);
  const hasSimulation = capability.supportsSimulation;

  if (hasConsensus && hasSimulation) {
    return {
      isFullySupported: true,
      badgeText: "Full",
      helperText: null,
    };
  }

  if (!hasSimulation && !hasConsensus) {
    return {
      isFullySupported: false,
      badgeText: "Partial",
      helperText: "Partially supported: consensus verification and full simulation are not available on this network.",
    };
  }

  if (!hasSimulation) {
    return {
      isFullySupported: false,
      badgeText: "Partial",
      helperText: "Partially supported: full simulation is not available on this network.",
    };
  }

  return {
    isFullySupported: false,
    badgeText: "Partial",
    helperText: "Partially supported: consensus verification is not available on this network.",
  };
}

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
  const [hashDetails, setHashDetails] = useState<SafeTxHashDetails | undefined>(undefined);
  const [hashMatch, setHashMatch] = useState<boolean>(true);
  const [policyProof, setPolicyProof] = useState<PolicyProofVerificationResult | undefined>(undefined);
  const [simulationVerification, setSimulationVerification] = useState<SimulationVerificationResult | undefined>(undefined);
  const [consensusVerification, setConsensusVerification] = useState<ConsensusVerificationResult | undefined>(undefined);
  const [consensusSourceTrust, setConsensusSourceTrust] = useState<TrustLevel>("rpc-sourced");
  const [consensusSourceSummary, setConsensusSourceSummary] = useState<string>(
    "Consensus proof included but not yet verified (requires desktop app)."
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { config } = useSettingsConfig();
  const { success: toastSuccess } = useToast();

  useEffect(() => {
    const currentEvidence = evidence;

    if (!currentEvidence) {
      setSigResults({});
      setProposer(null);
      setTargetWarnings([]);
      setErrors([]);
      setHashMatch(true);
      setPolicyProof(undefined);
      setSimulationVerification(undefined);
      setConsensusVerification(undefined);
      setConsensusSourceTrust("rpc-sourced");
      setConsensusSourceSummary("Consensus proof included but not yet verified (requires desktop app).");
      return;
    }

    setSigResults({});
    setProposer(null);
    setTargetWarnings([]);
    setErrors([]);
    setHashMatch(true);
    setPolicyProof(undefined);
    setSimulationVerification(undefined);
    setConsensusVerification(undefined);
    setConsensusSourceTrust("rpc-sourced");
    setConsensusSourceSummary("Consensus proof included but not yet verified (requires desktop app).");

    let cancelled = false;

    async function verifyAll() {
      if (!currentEvidence) return;
      try {
        const report = await verifyEvidencePackage(currentEvidence, {
          settings: config ?? null,
        });

        if (cancelled) return;
        setSigResults(report.signatures.byOwner);
        setProposer(report.proposer);
        setTargetWarnings(report.targetWarnings);
        setErrors([]);
        setHashDetails(report.hashDetails);
        setHashMatch(report.hashMatch);
        setPolicyProof(report.policyProof);
        setSimulationVerification(report.simulationVerification);
        const initialConsensusSource = report.sources.find((source) => source.id === "consensus-proof");
        if (initialConsensusSource) {
          setConsensusSourceTrust(initialConsensusSource.trust);
          setConsensusSourceSummary(initialConsensusSource.summary);
        }

        // If consensus proof is present, verify via Tauri backend (BLS verification)
        if (currentEvidence.consensusProof) {
          const expectedStateRoot = currentEvidence.onchainPolicyProof?.stateRoot;
          if (!expectedStateRoot) {
            const missingRootResult: ConsensusVerificationResult = {
              valid: false,
              verified_state_root: null,
              verified_block_number: null,
              state_root_matches: false,
              sync_committee_participants: 0,
              error: "Consensus proof cannot be independently verified: missing onchainPolicyProof.stateRoot.",
              error_code: "missing-policy-state-root",
              checks: [],
            };
            const upgradedReport = applyConsensusVerificationToReport(
              report,
              currentEvidence,
              {
                settings: config ?? null,
                consensusVerification: missingRootResult,
              }
            );
            if (!cancelled) {
              const consensusSource = upgradedReport.sources.find((source) => source.id === "consensus-proof");
              setConsensusVerification(missingRootResult);
              if (consensusSource) {
                setConsensusSourceTrust(consensusSource.trust);
                setConsensusSourceSummary(consensusSource.summary);
              }
            }
            return;
          }

          const consensusInput: ConsensusProofVerifyInput = {
            ...currentEvidence.consensusProof,
            expectedStateRoot,
            packageChainId: currentEvidence.chainId,
            packagePackagedAt: currentEvidence.packagedAt,
          };

          try {
            const consensusResult = await invoke<ConsensusVerificationResult>(
              "verify_consensus_proof",
              { input: consensusInput }
            );
            const upgradedReport = applyConsensusVerificationToReport(
              report,
              currentEvidence,
              {
                settings: config ?? null,
                consensusVerification: consensusResult,
              }
            );
            if (!cancelled) {
              const consensusSource = upgradedReport.sources.find((source) => source.id === "consensus-proof");
              setConsensusVerification(consensusResult);
              if (consensusSource) {
                setConsensusSourceTrust(consensusSource.trust);
                setConsensusSourceSummary(consensusSource.summary);
              }
            }
          } catch (err) {
            const failedResult: ConsensusVerificationResult = {
              valid: false,
              verified_state_root: null,
              verified_block_number: null,
              state_root_matches: false,
              sync_committee_participants: 0,
              error: err instanceof Error ? err.message : String(err),
              error_code: "tauri-invoke-failed",
              checks: [],
            };
            const upgradedReport = applyConsensusVerificationToReport(
              report,
              currentEvidence,
              {
                settings: config ?? null,
                consensusVerification: failedResult,
              }
            );
            if (!cancelled) {
              const consensusSource = upgradedReport.sources.find((source) => source.id === "consensus-proof");
              setConsensusVerification(failedResult);
              if (consensusSource) {
                setConsensusSourceTrust(consensusSource.trust);
                setConsensusSourceSummary(consensusSource.summary);
              }
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        setErrors([err instanceof Error ? err.message : "Verification failed unexpectedly"]);
      }
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
    setHashDetails(undefined);

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
      : signatureResults.some((r) => r.status === "invalid" || r.status === "unsupported")
        ? "api-sourced"
        : "self-verified";
  const networkSupport = evidence ? getNetworkSupportStatus(evidence.chainId) : null;

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
          <InterpretationCard
            dataDecoded={evidence.dataDecoded}
            txTo={evidence.transaction.to}
            txOperation={evidence.transaction.operation}
            txData={evidence.transaction.data}
            chainId={evidence.chainId}
            txValue={evidence.transaction.value}
            txFrom={evidence.safeAddress}
            context={{
              currentThreshold: evidence.confirmationsRequired,
              chainId: evidence.chainId,
            }}
            disabledInterpreters={config?.disabledInterpreters}
          />

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
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-sm">{getChainName(evidence.chainId)}</div>
                    {networkSupport && (
                      <span
                        title={networkSupport.helperText ?? "Fully supported: consensus verification and simulation are available."}
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                          networkSupport.isFullySupported
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        }`}
                      >
                        {networkSupport.badgeText}
                      </span>
                    )}
                  </div>
                  {networkSupport?.helperText && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-300">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span>{networkSupport.helperText}</span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
                    Safe Address <TrustBadge level="self-verified" />
                  </div>
                  <AddressDisplay address={evidence.safeAddress} chainId={evidence.chainId} />
                </div>

                {proposer && (
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
                      <UserRound className="h-3.5 w-3.5" />
                      Proposed by
                    </div>
                    <AddressDisplay address={proposer} chainId={evidence.chainId} />
                  </div>
                )}

                <div className="md:col-span-2">
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
                    Safe TX Hash <TrustBadge level="self-verified" />
                  </div>
                  <HashVerificationDetails
                    safeTxHash={evidence.safeTxHash}
                    details={hashDetails}
                  />
                  {!hashMatch && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Hash mismatch: the stored safeTxHash does not match the recomputed hash.
                        The transaction data may have been tampered with.
                      </span>
                    </div>
                  )}
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
                      <AddressDisplay address={conf.owner} chainId={evidence.chainId} />
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

          {policyProof && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>On-Chain Policy Proof</CardTitle>
                  <TrustBadge level={policyProof.valid ? "proof-verified" : "rpc-sourced"} />
                </div>
                <CardDescription>
                  {policyProof.valid
                    ? "All policy fields cryptographically verified against state root"
                    : `Proof verification failed: ${policyProof.errors.length} error(s)`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {policyProof.checks.map((check) => (
                    <div key={check.id} className="flex items-center justify-between rounded-md border border-border/15 glass-subtle px-3 py-2">
                      <span className="text-sm font-medium">{check.label}</span>
                      <div className="flex items-center gap-2">
                        {check.passed ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                            <ShieldCheck className="h-3 w-3" />
                            Pass
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-400">
                            <AlertTriangle className="h-3 w-3" />
                            Fail
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {policyProof.errors.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {policyProof.errors.map((err, i) => (
                      <div key={i} className="text-xs text-red-400">{err}</div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {simulationVerification ? (
            <SimulationCard
              evidence={evidence}
              simulationVerification={simulationVerification}
            />
          ) : (
            <SimulationUnavailableCard evidence={evidence} />
          )}

          {(consensusVerification || evidence?.consensusProof) && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>Consensus Verification</CardTitle>
                  <TrustBadge level={consensusSourceTrust} />
                </div>
                <CardDescription>
                  {!consensusVerification
                    ? "Verifying consensus proof via BLS sync committee signatures..."
                    : consensusVerification.valid
                      ? `State root verified against Ethereum consensus (${consensusVerification.sync_committee_participants}/512 validators)`
                      : consensusVerification.error ?? consensusSourceSummary}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {consensusVerification ? (
                  <div className="space-y-1.5">
                    {consensusVerification.checks.map((check) => (
                      <div key={check.id} className="flex items-center justify-between rounded-md border border-border/15 glass-subtle px-3 py-2">
                        <span className="text-sm font-medium">{check.label}</span>
                        <div className="flex items-center gap-2">
                          {check.detail && (
                            <span className="text-xs text-muted">{check.detail}</span>
                          )}
                          {check.passed ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                              <ShieldCheck className="h-3 w-3" />
                              Pass
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-400">
                              <AlertTriangle className="h-3 w-3" />
                              Fail
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {consensusVerification.verified_state_root && (
                      <div className="mt-2 rounded-md border border-border/15 glass-subtle px-3 py-2">
                        <div className="text-xs text-muted">Verified State Root</div>
                        <div className="font-mono text-xs break-all">{consensusVerification.verified_state_root}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted animate-pulse">Running BLS verification...</div>
                )}
              </CardContent>
            </Card>
          )}

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
                  <AddressDisplay address={evidence.transaction.to} chainId={evidence.chainId} />
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

// ── Token event icons ─────────────────────────────────────────────────

const EVENT_ICON: Record<string, { Icon: typeof ArrowUpRight; color: string; label: string }> = {
  transfer: { Icon: ArrowUpRight, color: "text-blue-400", label: "Transfer" },
  approval: { Icon: KeyRound, color: "text-amber-400", label: "Approval" },
  "nft-transfer": { Icon: ArrowUpRight, color: "text-purple-400", label: "NFT Transfer" },
  "erc1155-transfer": { Icon: ArrowUpRight, color: "text-purple-400", label: "ERC-1155" },
  wrap: { Icon: Repeat, color: "text-cyan-400", label: "Wrap" },
  unwrap: { Icon: Repeat, color: "text-cyan-400", label: "Unwrap" },
};

const DIRECTION_STYLE: Record<string, { bg: string; border: string; label: string; Icon: typeof ArrowUpRight }> = {
  send: { bg: "bg-red-500/8", border: "border-red-500/20", label: "Send", Icon: ArrowUpRight },
  receive: { bg: "bg-emerald-500/8", border: "border-emerald-500/20", label: "Receive", Icon: ArrowDownLeft },
  internal: { bg: "bg-surface-2/40", border: "border-border/15", label: "Internal", Icon: Repeat },
};

// ── SimulationCard ───────────────────────────────────────────────────

function SimulationCard({
  evidence,
  simulationVerification,
}: {
  evidence: EvidencePackage;
  simulationVerification: SimulationVerificationResult;
}) {
  const [showChecks, setShowChecks] = useState(false);

  const decodedEvents = useMemo(() => {
    if (!evidence.simulation?.logs) return [];
    return decodeSimulationEvents(
      evidence.simulation.logs,
      evidence.safeAddress,
      evidence.chainId,
    );
  }, [evidence.simulation?.logs, evidence.safeAddress, evidence.chainId]);

  // Separate events by direction for summary
  const sends = decodedEvents.filter((e) => e.direction === "send" && e.kind === "transfer");
  const receives = decodedEvents.filter((e) => e.direction === "receive" && e.kind === "transfer");
  const approvals = decodedEvents.filter((e) => e.kind === "approval");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Transaction Simulation</CardTitle>
          <TrustBadge level={evidence?.simulation?.trust ?? "rpc-sourced"} />
        </div>
        <CardDescription>
          {!simulationVerification.valid
            ? `Simulation has ${simulationVerification.errors.length} issue(s)`
            : simulationVerification.executionReverted
              ? "Structurally valid, but the transaction REVERTED"
              : decodedEvents.length > 0
                ? `${decodedEvents.length} token event${decodedEvents.length !== 1 ? "s" : ""} detected`
                : "Simulation passed — no token events detected"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Primary view: decoded token movements */}
        {decodedEvents.length > 0 && (
          <div className="space-y-2 mb-4">
            {decodedEvents.map((event, i) => (
              <TokenEventRow key={i} event={event} chainId={evidence.chainId} />
            ))}
          </div>
        )}

        {/* Net summary for swaps: show what goes out and what comes in */}
        {sends.length > 0 && receives.length > 0 && (
          <div className="mb-4 rounded-md border border-border/15 glass-subtle p-3">
            <div className="text-xs font-medium text-muted mb-2">Net Effect</div>
            <div className="flex items-center gap-3 flex-wrap">
              {sends.map((s, i) => (
                <span key={`s-${i}`} className="inline-flex items-center gap-1 text-sm text-red-400">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  {s.amountFormatted}
                </span>
              ))}
              <span className="text-muted text-xs">→</span>
              {receives.map((r, i) => (
                <span key={`r-${i}`} className="inline-flex items-center gap-1 text-sm text-emerald-400">
                  <ArrowDownLeft className="h-3.5 w-3.5" />
                  {r.amountFormatted}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Approval warnings */}
        {approvals.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {approvals.map((a, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <KeyRound className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-xs text-amber-300">
                  Approves <span className="font-medium text-amber-400">{a.amountFormatted}</span>
                  {" "}to <code className="font-mono text-[10px]">{a.to.slice(0, 10)}…</code>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Collapsible structural checks */}
        <button
          onClick={() => setShowChecks((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showChecks ? "rotate-180" : ""}`} />
          {showChecks ? "Hide" : "Show"} structural checks ({simulationVerification.checks.length})
        </button>

        {showChecks && (
          <div className="mt-2 space-y-1.5">
            {simulationVerification.checks.map((check) => (
              <div key={check.id} className="flex items-center justify-between rounded-md border border-border/15 glass-subtle px-3 py-2">
                <span className="text-sm font-medium">{check.label}</span>
                <div className="flex items-center gap-2">
                  {check.detail && (
                    <span className="text-xs text-muted">{check.detail}</span>
                  )}
                  {check.passed ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                      <ShieldCheck className="h-3 w-3" />
                      Pass
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-red-400">
                      <AlertTriangle className="h-3 w-3" />
                      Fail
                    </span>
                  )}
                </div>
              </div>
            ))}
            {simulationVerification.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {simulationVerification.errors.map((err, i) => (
                  <div key={i} className="text-xs text-red-400">{err}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SimulationUnavailableCard({ evidence }: { evidence: EvidencePackage }) {
  const reason = getSimulationUnavailableReason(evidence);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction Simulation</CardTitle>
        <CardDescription>Simulation unavailable</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{reason}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── TokenEventRow ─────────────────────────────────────────────────────

function TokenEventRow({ event, chainId }: { event: DecodedEvent; chainId: number }) {
  const evStyle = EVENT_ICON[event.kind] ?? EVENT_ICON.transfer;
  const dirStyle = DIRECTION_STYLE[event.direction] ?? DIRECTION_STYLE.internal;
  const DirIcon = dirStyle.Icon;

  return (
    <div className={`flex items-center gap-3 rounded-md border ${dirStyle.border} ${dirStyle.bg} px-3 py-2.5`}>
      {/* Direction icon */}
      <div className={`shrink-0 rounded-full p-1.5 ${
        event.direction === "send" ? "bg-red-500/15" :
        event.direction === "receive" ? "bg-emerald-500/15" :
        "bg-surface-2/60"
      }`}>
        <DirIcon className={`h-4 w-4 ${
          event.direction === "send" ? "text-red-400" :
          event.direction === "receive" ? "text-emerald-400" :
          "text-muted"
        }`} />
      </div>

      {/* Amount + token */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${
            event.direction === "send" ? "text-red-400" :
            event.direction === "receive" ? "text-emerald-400" :
            "text-fg"
          }`}>
            {event.direction === "send" ? "−" : event.direction === "receive" ? "+" : ""}
            {event.amountFormatted}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${evStyle.color} bg-surface-2/50`}>
            {evStyle.label}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          {event.kind !== "approval" ? (
            <>
              <span>From</span>
              <AddressDisplay address={event.from} chainId={chainId} className="text-[10px]" />
              <span>→</span>
              <AddressDisplay address={event.to} chainId={chainId} className="text-[10px]" />
            </>
          ) : (
            <>
              <span>Spender</span>
              <AddressDisplay address={event.to} chainId={chainId} className="text-[10px]" />
            </>
          )}
        </div>
      </div>

      {/* Token contract */}
      {!event.tokenSymbol && (
        <AddressDisplay address={event.token} chainId={chainId} className="text-[10px]" />
      )}
    </div>
  );
}
