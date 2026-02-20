import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  parseEvidencePackage,
  getChainName,
  verifyEvidencePackage,
  applyConsensusVerificationToReport,
  buildCoreExecutionSafetyFields,
} from "@safelens/core";
import { TrustBadge } from "@/components/trust-badge";
import { InterpretationCard } from "@/components/interpretation-card";
import { CallArray } from "@/components/call-array";
import { AddressDisplay } from "@/components/address-display";
import { HashVerificationDetails } from "@/components/hash-verification-details";
import { useSettingsConfig } from "@/lib/settings/hooks";
import {
  buildSafetyAttentionItems,
  classifyConsensusStatus,
  type SafetyCheck,
  type SafetyStatus,
} from "@/lib/safety-checks";
import { buildSimulationFreshnessDetail } from "@/lib/simulation-freshness";
import { buildNetworkSupportStatus, type NetworkSupportStatus } from "@/lib/network-support";
import { buildConsensusDetailRows } from "@/lib/consensus-details";
import { buildPolicyDetailRows } from "@/lib/policy-details";
import { buildSimulationDetailRows } from "@/lib/simulation-details";
import {
  getSimulationUnavailableReason,
  getSimulationUnavailableReasonCode,
} from "@/lib/simulation-unavailable";
import { ShieldCheck, AlertTriangle, HelpCircle, UserRound, Upload, ChevronRight, ChevronDown } from "lucide-react";
import type { EvidencePackage, SignatureCheckResult, TransactionWarning, TrustLevel, SafeTxHashDetails, PolicyProofVerificationResult, SimulationVerificationResult, ConsensusVerificationResult } from "@safelens/core";
import { invoke } from "@tauri-apps/api/core";

type ConsensusProofVerifyInput = EvidencePackage["consensusProof"] extends infer T
  ? T extends object
    ? T & {
        expectedStateRoot: string;
        packageChainId: number;
        packagePackagedAt: string;
      }
    : never
  : never;

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

function classifyPolicyStatus(
  evidence: EvidencePackage,
  policyProof: PolicyProofVerificationResult | undefined
): SafetyCheck {
  const exportReasons = evidence.exportContract?.reasons ?? [];

  if (!evidence.onchainPolicyProof) {
    return {
      id: "policy-authentic",
      label: "Policy is authentic",
      status: "warning",
      detail: "No on-chain policy proof was included in this evidence package.",
      reasonCode: exportReasons.includes("missing-onchain-policy-proof")
        ? "missing-onchain-policy-proof"
        : undefined,
    };
  }

  if (!policyProof) {
    return {
      id: "policy-authentic",
      label: "Policy is authentic",
      status: "warning",
      detail: "Policy proof verification is still running.",
    };
  }

  if (policyProof.valid) {
    return {
      id: "policy-authentic",
      label: "Policy is authentic",
      status: "check",
      detail: "All policy fields matched the on-chain proof.",
    };
  }

  return {
    id: "policy-authentic",
    label: "Policy is authentic",
    status: "error",
    detail: policyProof.errors[0] ?? "Policy proof verification failed.",
    reasonCode: "policy-proof-verification-failed",
  };
}

function classifySimulationStatus(
  evidence: EvidencePackage,
  simulationVerification: SimulationVerificationResult | undefined
): SafetyCheck {
  if (!simulationVerification || !evidence.simulation) {
    const reasonCode = getSimulationUnavailableReasonCode(evidence);
    return {
      id: "simulation-outcome",
      label: "Simulation outcome",
      status: "warning",
      detail: getSimulationUnavailableReason(evidence),
      reasonCode: reasonCode ?? undefined,
    };
  }

  if (!simulationVerification.valid) {
    return {
      id: "simulation-outcome",
      label: "Simulation outcome",
      status: "error",
      detail:
        simulationVerification.errors[0] ??
        "Simulation structure checks failed.",
      reasonCode: "simulation-verification-failed",
    };
  }

  if (simulationVerification.executionReverted) {
    return {
      id: "simulation-outcome",
      label: "Simulation outcome",
      status: "warning",
      detail: "Simulation ran but the transaction reverted.",
      reasonCode: "simulation-execution-reverted",
    };
  }

  return {
    id: "simulation-outcome",
    label: "Simulation outcome",
    status: "check",
    detail: "Simulation ran successfully.",
  };
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
  const [consensusSourceSummary, setConsensusSourceSummary] = useState<string>(
    "Consensus proof included but not yet verified (requires desktop app)."
  );
  const [showSafetyDetails, setShowSafetyDetails] = useState(false);
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
      setConsensusSourceSummary("Consensus proof included but not yet verified (requires desktop app).");
      setShowSafetyDetails(false);
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
    setConsensusSourceSummary("Consensus proof included but not yet verified (requires desktop app).");
    setShowSafetyDetails(false);

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
  const networkSupport = evidence ? buildNetworkSupportStatus(evidence) : null;
  const safetyChecks = useMemo(() => {
    if (!evidence) return [];
    return [
      classifyPolicyStatus(evidence, policyProof),
      classifyConsensusStatus(evidence, consensusVerification, consensusSourceSummary),
      classifySimulationStatus(evidence, simulationVerification),
    ];
  }, [evidence, policyProof, consensusVerification, consensusSourceSummary, simulationVerification]);

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
          <ExecutionSafetyPanel
            evidence={evidence}
            checks={safetyChecks}
            hashMatch={hashMatch}
            networkSupport={networkSupport}
            consensusVerification={consensusVerification}
            policyProof={policyProof}
            simulationVerification={simulationVerification}
            showDetails={showSafetyDetails}
            onToggleDetails={() => setShowSafetyDetails((value) => !value)}
          />

          {showSafetyDetails && (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}

const SAFETY_STATUS_STYLE: Record<SafetyStatus, { text: string; badge: string; icon: typeof ShieldCheck }> = {
  check: {
    text: "text-emerald-300",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    icon: ShieldCheck,
  },
  warning: {
    text: "text-amber-300",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    icon: AlertTriangle,
  },
  error: {
    text: "text-red-300",
    badge: "border-red-500/30 bg-red-500/10 text-red-300",
    icon: AlertTriangle,
  },
};

function ExecutionSafetyPanel({
  evidence,
  checks,
  hashMatch,
  networkSupport,
  consensusVerification,
  policyProof,
  simulationVerification,
  showDetails,
  onToggleDetails,
}: {
  evidence: EvidencePackage;
  checks: SafetyCheck[];
  hashMatch: boolean;
  networkSupport: NetworkSupportStatus | null;
  consensusVerification: ConsensusVerificationResult | undefined;
  policyProof: PolicyProofVerificationResult | undefined;
  simulationVerification: SimulationVerificationResult | undefined;
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  const hasError = !hashMatch || checks.some((check) => check.status === "error");
  const hasWarning = checks.some((check) => check.status === "warning");

  const verdict = hasError
    ? { title: "Do not sign", detail: "One or more safety checks failed.", status: "error" as const }
    : hasWarning
      ? {
          title: "Manual review required",
          detail: "Some checks are partial or unavailable. Confirm transaction intent manually.",
          status: "warning" as const,
        }
      : {
          title: "No critical issues found",
          detail: "All available safety checks passed. Confirm intent and destinations before signing.",
          status: "check" as const,
        };

  const verdictStyle = SAFETY_STATUS_STYLE[verdict.status];
  const VerdictIcon = verdictStyle.icon;
  const simulationFreshness = buildSimulationFreshnessDetail(
    evidence.simulation,
    evidence.packagedAt
  );
  const attentionItems = buildSafetyAttentionItems(checks, networkSupport, 3);
  const passedChecks = checks.filter((check) => check.status === "check").length;
  const warningChecks = checks.filter((check) => check.status === "warning").length;
  const errorChecks = checks.filter((check) => check.status === "error").length;
  const consensusDetails = buildConsensusDetailRows(evidence, consensusVerification);
  const policyDetails = buildPolicyDetailRows(policyProof);
  const simulationDetails = buildSimulationDetailRows(
    {
      chainId: evidence.chainId,
      safeAddress: evidence.safeAddress,
      simulation: evidence.simulation,
    },
    simulationVerification,
    getSimulationUnavailableReason(evidence)
  );
  const coreExecutionDetails = buildCoreExecutionSafetyFields(evidence);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Execution Safety</CardTitle>
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${verdictStyle.badge}`}>
            <VerdictIcon className="h-3 w-3" />
            {verdict.title}
          </span>
        </div>
        <CardDescription>{verdict.detail}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hashMatch && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            Safe transaction hash mismatch detected. Treat this package as unsafe.
          </div>
        )}
        {!showDetails && attentionItems.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <div className="font-medium text-amber-200">Attention needed</div>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {attentionItems.map((item) => (
                <li key={item.id}>
                  {item.detail}
                  {item.reasonCode && (
                    <span className="text-amber-200"> (Reason code: {item.reasonCode})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {checks.map((check) => {
          const style = SAFETY_STATUS_STYLE[check.status];
          const Icon = style.icon;
          return (
            <div key={check.id} className="rounded-md border border-border/15 glass-subtle px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{check.label}</span>
                <span className={`inline-flex items-center gap-1 text-xs ${style.text}`}>
                  <Icon className="h-3 w-3" />
                  {check.status === "check" ? "Check" : check.status === "warning" ? "Warning" : "Error"}
                </span>
              </div>
              <div className={`mt-1 text-xs ${style.text}`}>{check.detail}</div>
              {showDetails && check.status !== "check" && check.reasonCode && (
                <div className="mt-1 text-[11px] text-muted">
                  Reason code: <code>{check.reasonCode}</code>
                </div>
              )}
            </div>
          );
        })}
        <div className="rounded-md border border-border/15 glass-subtle px-3 py-2">
          <div className="text-xs font-medium text-muted">Core execution details</div>
          <div className="mt-2 space-y-1.5">
            {coreExecutionDetails.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-muted">{item.label}</span>
                <span
                  className={
                    item.monospace
                      ? "max-w-[70%] break-all font-mono text-[11px] text-right"
                      : "max-w-[70%] text-right"
                  }
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-border/15 glass-subtle px-3 py-2 text-xs text-muted">
            Checks: {passedChecks} passed, {warningChecks} warning
            {warningChecks === 1 ? "" : "s"}, {errorChecks} error{errorChecks === 1 ? "" : "s"}.
          </div>
          <div className="rounded-md border border-border/15 glass-subtle px-3 py-2 text-xs text-muted">
            Coverage:{" "}
            {networkSupport ? (
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 font-medium ${
                  networkSupport.isFullySupported
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                }`}
              >
                {networkSupport.badgeText}
              </span>
            ) : (
              "Unknown"
            )}
          </div>
        </div>
        <div className="rounded-md border border-border/15 glass-subtle px-3 py-2 text-xs text-muted">
          {simulationFreshness}
        </div>
        {networkSupport && (
          <div className="flex flex-wrap items-start gap-2 text-xs">
            <span className="text-muted">Network support:</span>
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 font-medium ${
                networkSupport.isFullySupported
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}
            >
              {networkSupport.badgeText}
            </span>
            {showDetails && networkSupport.helperText && (
              <span className="basis-full text-amber-300 sm:basis-auto">
                {networkSupport.helperText}
              </span>
            )}
          </div>
        )}
        {showDetails && consensusDetails.length > 0 && (
          <div className="rounded-md border border-border/15 glass-subtle px-3 py-2">
            <div className="text-xs font-medium text-muted">Consensus details</div>
            <div className="mt-2 space-y-1.5">
              {consensusDetails.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-muted">{item.label}</span>
                  <span className={item.monospace ? "max-w-[70%] break-all font-mono text-[11px]" : ""}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {showDetails && (
          <div className="rounded-md border border-border/15 glass-subtle px-3 py-2">
            <div className="text-xs font-medium text-muted">Simulation details</div>
            <div className="mt-2 space-y-1.5">
              {simulationDetails.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-muted">{item.label}</span>
                  <span className="max-w-[70%] text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {showDetails && (
          <div className="rounded-md border border-border/15 glass-subtle px-3 py-2">
            <div className="text-xs font-medium text-muted">Policy details</div>
            <div className="mt-2 space-y-1.5">
              {policyDetails.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-muted">{item.label}</span>
                  <span className="max-w-[70%] text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={onToggleDetails}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? "rotate-180" : ""}`} />
          {showDetails ? "Hide details" : "Show details"}
        </button>
      </CardContent>
    </Card>
  );
}
