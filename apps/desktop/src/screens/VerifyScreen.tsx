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
  decodeSimulationEvents,
  decodeNativeTransfers,
  computeRemainingApprovals,
  normalizeCallSteps,
  verifyCalldata,
  VERIFICATION_SOURCE_IDS,
} from "@safelens/core";
import { TrustBadge } from "@/components/trust-badge";
import { InterpretationCard } from "@/components/interpretation-card";
import { CallArray } from "@/components/call-array";
import { AddressDisplay } from "@/components/address-display";
import { HashValueDisplay, IntermediateHashesDetails } from "@/components/hash-verification-details";
import { useSettingsConfig } from "@/lib/settings/hooks";
import {
  buildSafetyAttentionItems,
  classifyPolicyStatus,
  classifyConsensusStatus,
  classifySimulationStatus,
  type SafetyCheck,
  type SafetyStatus,
} from "@/lib/safety-checks";
import { buildSimulationFreshnessDetail, formatRelativeTime } from "@/lib/simulation-freshness";
import { buildNetworkSupportStatus, type NetworkSupportStatus } from "@/lib/network-support";
import { buildConsensusDetailRows } from "@/lib/consensus-details";
import { buildPolicyDetailRows } from "@/lib/policy-details";
import { buildSimulationDetailRows } from "@/lib/simulation-details";
import {
  getSimulationUnavailableReason,
} from "@/lib/simulation-unavailable";
import { ShieldCheck, AlertTriangle, HelpCircle, Upload, ChevronRight } from "lucide-react";
import type {
  EvidencePackage,
  SignatureCheckResult,
  TransactionWarning,
  SafeTxHashDetails,
  PolicyProofVerificationResult,
  SimulationVerificationResult,
  ConsensusVerificationResult,
  WarningLevel,
} from "@safelens/core";
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

type WarningStyle = {
  border: string;
  bg: string;
  text: string;
  Icon: typeof AlertTriangle;
};

const WARNING_STYLES = {
  info: { border: "border-blue-500/20", bg: "bg-blue-500/10", text: "text-blue-400", Icon: HelpCircle },
  warning: { border: "border-amber-500/20", bg: "bg-amber-500/10", text: "text-amber-400", Icon: AlertTriangle },
  danger: { border: "border-red-500/20", bg: "bg-red-500/10", text: "text-red-400", Icon: AlertTriangle },
} satisfies Record<WarningLevel, WarningStyle>;

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
  const [consensusSourceSummary, setConsensusSourceSummary] = useState<string>("");
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
      setConsensusSourceSummary("");
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
    // Only set "included but not yet verified" when a proof actually exists.
    // Otherwise classifyConsensusStatus sees this as a fallback and misleadingly
    // reports "included" for packages that have no consensus proof at all.
    setConsensusSourceSummary(
      currentEvidence?.consensusProof
        ? "Consensus proof included but not yet verified (requires desktop app)."
        : "",
    );
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
        const initialConsensusSource = report.sources.find(
          (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
        );
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
              const consensusSource = upgradedReport.sources.find(
                (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
              );
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
              const consensusSource = upgradedReport.sources.find(
                (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
              );
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
              const consensusSource = upgradedReport.sources.find(
                (source) => source.id === VERIFICATION_SOURCE_IDS.CONSENSUS_PROOF
              );
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

  const networkSupport = evidence ? buildNetworkSupportStatus(evidence) : null;
  const safetyChecks = useMemo(() => {
    if (!evidence) return [];
    return [
      classifyPolicyStatus(evidence, policyProof),
      classifyConsensusStatus(evidence, consensusVerification, consensusSourceSummary),
      classifySimulationStatus(evidence, simulationVerification),
    ];
  }, [evidence, policyProof, consensusVerification, consensusSourceSummary, simulationVerification]);
  const decodedCallsSummary = useMemo(() => {
    if (!evidence?.dataDecoded) return null;
    const steps = normalizeCallSteps(
      evidence.dataDecoded,
      evidence.transaction.to,
      evidence.transaction.value,
      evidence.transaction.operation,
      evidence.transaction.data
    );
    if (steps.length === 0) return null;
    const allVerified = steps.every((step) => verifyCalldata(step).status === "verified");
    return {
      count: steps.length,
      trustLevel: allVerified
        ? ("self-verified" as const)
        : ("api-sourced" as const),
    };
  }, [evidence]);

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
            <CardContent className="space-y-3">
              {/* Chain + Safe Address */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-muted">Chain</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{getChainName(evidence.chainId)}</span>
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
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-muted">Safe Address</div>
                  <AddressDisplay address={evidence.safeAddress} chainId={evidence.chainId} />
                </div>
              </div>

              {/* Safe TX Hash */}
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Safe TX Hash</div>
                <HashValueDisplay hash={hashDetails?.safeTxHash ?? evidence.safeTxHash} />
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

              {/* Signatures (collapsible) */}
              <details className="group/sigs pb-1 open:pb-0">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted hover:text-fg transition-colors [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-3 w-3 transition-transform group-open/sigs:rotate-90" />
                  Signatures
                </summary>
                <div className="mt-1.5 space-y-1">
                  {evidence.confirmations.map((conf, i) => {
                    const sigResult = sigResults[conf.owner];
                    const isProposer = proposer === conf.owner;
                    return (
                      <details key={i} className="group/sig">
                        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-surface-2/30 transition-colors [&::-webkit-details-marker]:hidden">
                          {sigResult ? (
                            sigResult.status === "valid" ? (
                              <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" />
                            ) : sigResult.status === "invalid" ? (
                              <AlertTriangle className="h-3 w-3 shrink-0 text-red-400" />
                            ) : (
                              <HelpCircle className="h-3 w-3 shrink-0 text-amber-400" />
                            )
                          ) : (
                            <span className="h-3 w-3 shrink-0 rounded-full border border-muted/30" />
                          )}
                          <AddressDisplay address={conf.owner} chainId={evidence.chainId} />
                          {isProposer && <span className="text-muted">(proposer)</span>}
                          {sigResult && sigResult.status === "invalid" && (
                            <span className="text-red-400">Invalid</span>
                          )}
                          {sigResult && sigResult.status === "unsupported" && (
                            <span className="text-amber-400">{sigResult.reason}</span>
                          )}
                          <span className="ml-auto shrink-0 text-muted">{new Date(conf.submissionDate).toLocaleDateString()}</span>
                          <ChevronRight className="h-3 w-3 shrink-0 text-muted/50 transition-transform group-open/sig:rotate-90" />
                        </summary>
                        <code className="mt-1 mb-1 ml-7 block break-all text-xs text-muted">
                          {conf.signature}
                        </code>
                      </details>
                    );
                  })}
                </div>
              </details>

              {/* Ethereum TX Hash (if available) */}
              {evidence.ethereumTxHash && (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted">Ethereum TX Hash</div>
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

              {/* Intermediate hashes for hardware wallet verification */}
              {hashDetails && <IntermediateHashesDetails details={hashDetails} />}
            </CardContent>
          </Card>

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
                  <details className="group/decoded pb-1 open:pb-0">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted hover:text-fg transition-colors [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="h-3 w-3 transition-transform group-open/decoded:rotate-90" />
                      Decoded Calls
                      {decodedCallsSummary && (
                        <>
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-surface-2/60 px-1.5 text-[10px] font-semibold text-muted">
                            {decodedCallsSummary.count}
                          </span>
                          <TrustBadge level={decodedCallsSummary.trustLevel} />
                        </>
                      )}
                    </summary>
                    <div className="mt-1.5">
                      <CallArray
                        dataDecoded={evidence.dataDecoded}
                        txTo={evidence.transaction.to}
                        txValue={evidence.transaction.value}
                        txOperation={evidence.transaction.operation}
                        txData={evidence.transaction.data}
                        showHeader={false}
                      />
                    </div>
                  </details>
                )}
                {evidence.transaction.data && (
                  <details className="group/calldata pb-1 open:pb-0">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted hover:text-fg transition-colors [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="h-3 w-3 transition-transform group-open/calldata:rotate-90" />
                      Calldata
                      <TrustBadge level="self-verified" />
                    </summary>
                    <code className="mt-1.5 block break-all rounded-md border border-border/15 glass-subtle p-2 text-xs">
                      {evidence.transaction.data}
                    </code>
                  </details>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

type VerificationStatus = SafetyStatus | "skipped";

const SAFETY_STATUS_STYLE: Record<VerificationStatus, { text: string; badge: string; icon: typeof ShieldCheck }> = {
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
  skipped: {
    text: "text-muted",
    badge: "border-border/30 bg-white/5 text-muted",
    icon: HelpCircle,
  },
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function SafePolicySection({ evidence }: { evidence: EvidencePackage }) {
  const policy = evidence.onchainPolicyProof?.decodedPolicy;
  const signers = new Set(evidence.confirmations.map((c) => c.owner.toLowerCase()));

  if (!policy) {
    return (
      <div className="rounded-md border border-border/15 glass-subtle px-3 py-2 text-xs text-muted">
        No on-chain policy proof available. Signer data is API-sourced.
      </div>
    );
  }

  const signedCount = policy.owners.filter((o) => signers.has(o.toLowerCase())).length;
  const hasModules = policy.modules.length > 0;
  const hasGuard = policy.guard !== ZERO_ADDRESS;

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted">Safe Policy</div>
      <div className="rounded-md border border-border/15 glass-subtle px-3 py-2 space-y-2">
        {/* Signing policy summary */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Required signatures</span>
          <span className="font-medium">{policy.threshold}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Signatures collected</span>
          <span className="font-medium">{signedCount} / {policy.threshold}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Total owners</span>
          <span className="font-medium">{policy.owners.length}</span>
        </div>

        {/* Owners */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Owners</span>
            <span className="text-muted">{signedCount} signed</span>
          </div>
          <div className="space-y-1">
            {policy.owners.map((owner) => {
              const hasSigned = signers.has(owner.toLowerCase());
              return (
                <div key={owner} className="flex items-center gap-2 text-xs">
                  {hasSigned ? (
                    <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" />
                  ) : (
                    <span className="h-3 w-3 shrink-0 rounded-full border border-muted/30" />
                  )}
                  <AddressDisplay address={owner} chainId={evidence.chainId} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Modules warning */}
        {hasModules && (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300">
            <div className="font-medium text-amber-200">Modules enabled — can bypass signatures</div>
            <div className="mt-1 space-y-0.5">
              {policy.modules.map((mod) => (
                <div key={mod}>
                  <AddressDisplay address={mod} chainId={evidence.chainId} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Guard */}
        {hasGuard && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">Guard</span>
            <AddressDisplay address={policy.guard} chainId={evidence.chainId} />
          </div>
        )}
      </div>
    </div>
  );
}

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
  const { config: settingsConfig } = useSettingsConfig();
  const nativeTokenSymbol = settingsConfig?.chains?.[String(evidence.chainId)]?.nativeTokenSymbol;
  const [badgeOpen, setBadgeOpen] = useState(false);
  const badgeWrapperRef = useRef<HTMLDivElement>(null);
  const badgePopupRef = useRef<HTMLDivElement>(null);
  const [badgePopupStyle, setBadgePopupStyle] = useState<React.CSSProperties>({});
  const checksWithoutRedundantRevertWarning = useMemo(
    () =>
      checks.filter(
        (check) =>
          !(
            check.id === "simulation-outcome" &&
            check.reasonCode === "simulation-execution-reverted"
          )
      ),
    [checks]
  );
  const checksForVerificationStatus = checksWithoutRedundantRevertWarning;

  // ── Badge popover positioning + dismiss ──────────────────────────
  useEffect(() => {
    if (!badgeOpen || !badgePopupRef.current || !badgeWrapperRef.current) return;
    const trigger = badgeWrapperRef.current;
    const popup = badgePopupRef.current;
    const triggerRect = trigger.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const pad = 8;

    let top: number;
    if (triggerRect.bottom + popupRect.height + pad <= window.innerHeight) {
      top = triggerRect.height + 8;
    } else {
      top = -(popupRect.height + 8);
    }

    let left = 0;
    const popupRight = triggerRect.left + popupRect.width;
    if (popupRight > window.innerWidth - pad) {
      left = -(popupRight - window.innerWidth + pad);
    }
    if (triggerRect.left + left < pad) {
      left = -(triggerRect.left - pad);
    }

    setBadgePopupStyle({ top, left });
  }, [badgeOpen]);

  useEffect(() => {
    if (!badgeOpen) return;
    const handler = (e: MouseEvent) => {
      if (badgeWrapperRef.current && !badgeWrapperRef.current.contains(e.target as Node)) {
        setBadgeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [badgeOpen]);

  useEffect(() => {
    if (!badgeOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBadgeOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [badgeOpen]);

  // ── Hash mismatch = hard gate ─────────────────────────────────────
  if (!hashMatch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>On-chain Verification</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Do not sign
            </div>
            <div className="mt-1 text-xs text-red-300">
              Safe transaction hash mismatch detected. The transaction fields may have been tampered with. This package cannot be trusted.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Verification status ───────────────────────────────────────────
  const hasError = checksForVerificationStatus.some((check) => check.status === "error");
  const hasWarning = checksForVerificationStatus.some((check) => check.status === "warning");

  const freshnessDescription = (() => {
    const sim = evidence.simulation;
    if (!sim) return "Simulation not available for this package.";
    const blockPart = `block ${sim.blockNumber}`;
    if (sim.blockTimestamp) {
      const relative = formatRelativeTime(sim.blockTimestamp);
      return relative
        ? `Verified at ${blockPart}, ${relative}.`
        : `Verified at ${blockPart}.`;
    }
    return `Verified at ${blockPart}.`;
  })();

  const DATA_ABSENT_REASON_CODES = new Set([
    "missing-onchain-policy-proof",
    "missing-rpc-url",
    "missing-consensus-or-policy-proof",
    "missing-consensus-proof",
    "consensus-proof-fetch-failed",
  ]);

  const nonPassingChecks = checksForVerificationStatus.filter((c) => c.status !== "check");
  const allDataAbsent = nonPassingChecks.length > 0 && nonPassingChecks.every(
    (c) => c.reasonCode && DATA_ABSENT_REASON_CODES.has(c.reasonCode)
  );

  const verification = hasError
    ? { label: "Verification Failed", description: "One or more safety checks failed. Do not sign.", status: "error" as const }
    : hasWarning && allDataAbsent
      ? { label: "Skipped", description: "Generated without an RPC URL — some verification data is unavailable.", status: "skipped" as const }
      : hasWarning
        ? { label: "Partially Verified", description: "Some checks are partial or unavailable.", status: "warning" as const }
        : { label: "Fully Verified", description: freshnessDescription, status: "check" as const };

  const verificationStyle = SAFETY_STATUS_STYLE[verification.status];
  const VerificationIcon = verificationStyle.icon;

  // ── Top attention item (most severe issue, shown below badge) ─────
  const attentionItems = buildSafetyAttentionItems(
    checksWithoutRedundantRevertWarning,
    networkSupport,
    3
  );
  const topAttention = attentionItems.length > 0 && verification.status !== "check"
    ? attentionItems[0]
    : null;

  // ── Simulation effects ────────────────────────────────────────────
  const decodedEvents = useMemo(() => {
    if (!evidence.simulation?.logs) return [];
    const logEvents = decodeSimulationEvents(
      evidence.simulation.logs,
      evidence.safeAddress,
      evidence.chainId,
    );
    const nativeEvents = evidence.simulation.nativeTransfers?.length
      ? decodeNativeTransfers(
          evidence.simulation.nativeTransfers,
          evidence.safeAddress,
          nativeTokenSymbol ?? "ETH",
        )
      : [];
    return [...nativeEvents, ...logEvents];
  }, [evidence.simulation, evidence.safeAddress, evidence.chainId, nativeTokenSymbol]);

  const transferEvents = useMemo(
    () => decodedEvents.filter((e) => e.kind !== "approval"),
    [decodedEvents],
  );
  const remainingApprovals = useMemo(
    () => computeRemainingApprovals(decodedEvents),
    [decodedEvents],
  );

  const simulationAvailable = Boolean(evidence.simulation);
  const simulationPassed =
    simulationAvailable &&
    simulationVerification?.valid === true &&
    !simulationVerification.executionReverted;

  // ── Expandable detail data ────────────────────────────────────────
  const simulationFreshness = buildSimulationFreshnessDetail(evidence.simulation, evidence.packagedAt);
  const passedChecks = checksForVerificationStatus.filter((c) => c.status === "check").length;
  const warningChecks = checksForVerificationStatus.filter((c) => c.status === "warning").length;
  const errorChecks = checksForVerificationStatus.filter((c) => c.status === "error").length;
  const consensusDetails = buildConsensusDetailRows(evidence, consensusVerification);
  const policyDetails = buildPolicyDetailRows(policyProof);
  const simulationDetails = buildSimulationDetailRows(
    { chainId: evidence.chainId, safeAddress: evidence.safeAddress, simulation: evidence.simulation },
    simulationVerification,
    getSimulationUnavailableReason(evidence),
    nativeTokenSymbol,
  );
  const coreExecutionDetails = buildCoreExecutionSafetyFields(evidence);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>On-chain Verification</CardTitle>
          <div ref={badgeWrapperRef} className="relative inline-flex">
            <button
              type="button"
              onClick={() => setBadgeOpen((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors hover:brightness-125 ${verificationStyle.badge}`}
            >
              <VerificationIcon className="h-3 w-3" />
              {verification.label}
            </button>
            {badgeOpen && (
              <div
                ref={badgePopupRef}
                style={badgePopupStyle}
                className="absolute z-50 w-72 space-y-2 rounded-md border border-border/15 glass-panel px-3 py-2.5 text-xs shadow-lg"
              >
                {verification.status === "check" ? (
                  <div className="text-muted">
                    This evidence includes a simulation from an RPC node, verified locally
                    against finalized chain state using an embedded Helios lightclient.
                    On-chain conditions may change before execution, the actual outcome
                    could differ from what was simulated.
                  </div>
                ) : (
                  (() => {
                    const nonCheckWarnings = checksWithoutRedundantRevertWarning.filter(
                      (check) => check.status !== "check"
                    );
                    if (nonCheckWarnings.length === 0) {
                      return (
                        <div className="text-muted">
                          Simulation reverted. See the Simulation section for details.
                        </div>
                      );
                    }
                    return nonCheckWarnings.map((check) => {
                      const s = SAFETY_STATUS_STYLE[check.status];
                      const SIcon = s.icon;
                      return (
                        <div key={check.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-fg">{check.label}</span>
                            <span className={`inline-flex items-center gap-1 ${s.text}`}>
                              <SIcon className="h-3 w-3" />
                              {check.status === "warning" ? "Warning" : "Error"}
                            </span>
                          </div>
                          <div className={`mt-0.5 ${s.text}`}>{check.detail}</div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            )}
          </div>
        </div>
        <CardDescription>{verification.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Top attention hint (collapsed view) */}
        {!showDetails && topAttention && topAttention.reasonCode !== "missing-onchain-policy-proof" && (
          <div className={`rounded-md border px-3 py-2 text-xs ${
            verification.status === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
          }`}>
            {topAttention.detail}
          </div>
        )}

        {/* ── Safe Policy (always visible) ─────────────────────────── */}
        <SafePolicySection evidence={evidence} />

        {/* ── Simulation effects (always visible) ──────────────────── */}
        <div className="text-xs font-medium text-muted">Simulation</div>
        {simulationPassed ? (
          <>
            {transferEvents.length > 0 && (
              <div className="space-y-1.5">
                {transferEvents.map((event, i) => {
                  const colorClass =
                    event.direction === "send"
                      ? "text-red-400"
                      : event.direction === "receive"
                        ? "text-emerald-400"
                        : "text-muted";
                  const bgClass =
                    event.direction === "send"
                      ? "bg-red-500/5"
                      : event.direction === "receive"
                        ? "bg-emerald-500/5"
                        : "bg-surface-2/30";
                  const arrow =
                    event.direction === "send" ? "↗" : event.direction === "receive" ? "↙" : "↔";
                  const verb =
                    event.direction === "send" ? "Send" : event.direction === "receive" ? "Receive" : "Transfer";
                  const counterparty =
                    event.direction === "send" ? event.to : event.direction === "receive" ? event.from : event.to;
                  const preposition =
                    event.direction === "send" ? "to" : event.direction === "receive" ? "from" : "at";

                  return (
                    <div key={i} className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2 text-xs ${bgClass}`}>
                      <span className={`font-medium ${colorClass}`}>
                        {arrow} {verb}
                      </span>
                      <span className="font-medium">{event.amountFormatted}</span>
                      <span className="text-muted">{preposition}</span>
                      <AddressDisplay address={counterparty} chainId={evidence.chainId} />
                    </div>
                  );
                })}
              </div>
            )}
            {transferEvents.length === 0 && (
              <div className="rounded-md border border-border/15 glass-subtle px-3 py-2 text-xs text-muted">
                {evidence.simulation?.traceAvailable === false
                  ? "No token movements detected. Event details may be limited, RPC does not support debug_traceCall."
                  : "No token movements detected."}
              </div>
            )}
            {/* Remaining approvals warning */}
            {remainingApprovals.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <div className="text-xs font-medium text-amber-200">
                  Remaining token approvals
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {remainingApprovals.map((approval, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-300">
                      <span className={approval.isUnlimited ? "font-medium text-red-400" : "font-medium"}>
                        {approval.amountFormatted}
                      </span>
                      <span className="text-amber-400/70">to</span>
                      <AddressDisplay address={approval.spender} chainId={evidence.chainId} />
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 text-[11px] text-amber-400/70">
                  These allowances remain active after execution. Verify that the approved spenders are trusted.
                </div>
              </div>
            )}
          </>
        ) : simulationAvailable && simulationVerification?.executionReverted ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Token effects could not be determined because the simulation reverted.
          </div>
        ) : simulationAvailable && simulationVerification && !simulationVerification.valid ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            Simulation verification failed. Token effects cannot be trusted.
          </div>
        ) : (
          <div className="rounded-md border border-border/15 glass-subtle px-3 py-2 text-xs text-muted">
            Simulation not available — {getSimulationUnavailableReason(evidence).toLowerCase()}
          </div>
        )}

        <button
          onClick={onToggleDetails}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${showDetails ? "rotate-90" : ""}`} />
          {showDetails ? "Hide details" : "Show details"}
        </button>

        {/* ── Expandable details ───────────────────────────────────── */}
        {showDetails && (
          <div className="space-y-3 border-t border-border/10 pt-3">
            {/* ── Chain state + consensus details ──────────────────── */}
            {(() => {
              const check = checks.find((c) => c.id === "chain-state-finalized");
              if (!check) return null;
              const style = SAFETY_STATUS_STYLE[check.status];
              const Icon = style.icon;
              return (
                <div className="rounded-md border border-border/15 glass-subtle px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{check.label}</span>
                    <span className={`inline-flex items-center gap-1 text-xs ${style.text}`}>
                      <Icon className="h-3 w-3" />
                      {check.status === "check" ? "Check" : check.status === "warning" ? "Warning" : "Error"}
                    </span>
                  </div>
                  <div className={`mt-1 text-xs ${style.text}`}>{check.detail}</div>
                  {check.status !== "check" && check.reasonCode && (
                    <div className="mt-1 text-[11px] text-muted">
                      Reason code: <code>{check.reasonCode}</code>
                    </div>
                  )}
                  <div className="mt-2 text-[11px] text-muted">{simulationFreshness}</div>
                  {consensusDetails.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-t border-border/10 pt-2">
                      {consensusDetails.map((item) => (
                        <div key={item.id} className="flex items-start justify-between gap-3 text-xs">
                          <span className="text-muted">{item.label}</span>
                          <span className={item.monospace ? "max-w-[70%] break-all font-mono text-[11px]" : ""}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Simulation outcome + simulation details ──────────── */}
            {(() => {
              const check = checks.find((c) => c.id === "simulation-outcome");
              if (!check) return null;
              if (check.reasonCode === "simulation-execution-reverted") return null;
              const style = SAFETY_STATUS_STYLE[check.status];
              const Icon = style.icon;
              return (
                <div className="rounded-md border border-border/15 glass-subtle px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{check.label}</span>
                    <span className={`inline-flex items-center gap-1 text-xs ${style.text}`}>
                      <Icon className="h-3 w-3" />
                      {check.status === "check" ? "Check" : check.status === "warning" ? "Warning" : "Error"}
                    </span>
                  </div>
                  <div className={`mt-1 text-xs ${style.text}`}>{check.detail}</div>
                  {check.status !== "check" && check.reasonCode && (
                    <div className="mt-1 text-[11px] text-muted">
                      Reason code: <code>{check.reasonCode}</code>
                    </div>
                  )}
                  {simulationDetails.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-t border-border/10 pt-2">
                      {simulationDetails.map((item) => (
                        <div key={item.id} className="flex items-start justify-between gap-3 text-xs">
                          <span className="text-muted">{item.label}</span>
                          <span className="max-w-[70%] text-right">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Policy + policy details ──────────────────────────── */}
            {(() => {
              const check = checks.find((c) => c.id === "policy-authentic");
              if (!check) return null;
              const style = SAFETY_STATUS_STYLE[check.status];
              const Icon = style.icon;
              return (
                <div className="rounded-md border border-border/15 glass-subtle px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{check.label}</span>
                    <span className={`inline-flex items-center gap-1 text-xs ${style.text}`}>
                      <Icon className="h-3 w-3" />
                      {check.status === "check" ? "Check" : check.status === "warning" ? "Warning" : "Error"}
                    </span>
                  </div>
                  <div className={`mt-1 text-xs ${style.text}`}>{check.detail}</div>
                  {check.status !== "check" && check.reasonCode && (
                    <div className="mt-1 text-[11px] text-muted">
                      Reason code: <code>{check.reasonCode}</code>
                    </div>
                  )}
                  {policyDetails.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-t border-border/10 pt-2">
                      {policyDetails.map((item) => (
                        <div key={item.id} className="flex items-start justify-between gap-3 text-xs">
                          <span className="text-muted">{item.label}</span>
                          <span className="max-w-[70%] text-right">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Core execution details */}
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

            {/* Check summary & coverage */}
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

            {/* Network support */}
            {networkSupport && networkSupport.helperText && (
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
                <span className="basis-full text-amber-300 sm:basis-auto">
                  {networkSupport.helperText}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
