"use client";

import { useState, useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  parseSafeUrlFlexible,
  getChainName,
  getChainPrefix,
  fetchSafeTransaction,
  fetchPendingTransactions,
  createEvidencePackage,
  enrichWithOnchainProof,
  enrichWithSimulation,
  enrichWithConsensusProof,
  finalizeEvidenceExport,
  UNSUPPORTED_CONSENSUS_MODE_ERROR_CODE,
  decodeSimulationEvents,
  decodeNativeTransfers,
  computeRemainingApprovals,
  summarizeStateDiffs,
  DEFAULT_SETTINGS_CONFIG,
  buildGenerationSources,
  getExportContractReasonLabel,
  TRUST_CONFIG,
  SUPPORTED_CHAIN_IDS,
} from "@safelens/core";
import { downloadEvidencePackage } from "@/lib/download";
import { buildConsensusEnrichmentPlan } from "@/lib/consensus-enrichment";
import { summarizeConsensusProof } from "@/lib/consensus-proof-summary";
import { redactRpcUrl } from "@/lib/rpc-redaction";
import { AddressDisplay } from "@/components/address-display";
import type { EvidencePackage, SafeTransaction } from "@safelens/core";

const generationSources = buildGenerationSources();
const opstackConsensusEnabled = process.env.NEXT_PUBLIC_ENABLE_OPSTACK_CONSENSUS !== "0";
const lineaConsensusEnabled = process.env.NEXT_PUBLIC_ENABLE_LINEA_CONSENSUS !== "0";
const RPC_PING_TIMEOUT_MS = 3500;
const DEFAULT_RPC_CANDIDATES: Record<number, [string, string]> = {
  1: ["https://eth.drpc.org", "https://eth1.lava.build"],
  10: ["https://optimism.drpc.org", "https://go.getblock.io/e8a75f8dcf614861becfbcb185be6eb4"],
  100: ["https://gnosis.lfg.rs", "https://rpc.gnosischain.com"],
  137: ["https://polygon.drpc.org", "https://polygon.lava.build"],
  8453: ["https://base.drpc.org", "https://base.api.pocket.network"],
  42161: ["https://arbitrum.drpc.org", "https://arb-one.api.pocket.network"],
  11155111: ["https://sepolia.drpc.org", "https://rpc.sepolia.ethpandaops.io"],
};

type PendingTx = SafeTransaction & { _chainId: number };

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
function extractAddress(input: string): string | null {
  const trimmed = input.trim();
  if (ADDRESS_RE.test(trimmed)) return trimmed;
  // Also match if user pasted with surrounding quotes or whitespace
  const match = trimmed.match(/0x[a-fA-F0-9]{40}/);
  return match && !trimmed.startsWith("http") ? match[0] : null;
}

async function fetchRpcChainId(rpcUrl: string): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RPC_PING_TIMEOUT_MS);
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
      signal: ctrl.signal,
    });

    if (!response.ok) return null;
    const payload = await response.json() as { result?: string };
    if (typeof payload.result !== "string") return null;
    const chainId = Number.parseInt(payload.result, 16);
    return Number.isFinite(chainId) ? chainId : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function pingRpcChainId(rpcUrl: string, expectedChainId: number): Promise<boolean> {
  const chainId = await fetchRpcChainId(rpcUrl);
  return chainId === expectedChainId;
}

function EvidenceDisplay({
  evidence,
  onDownload,
  onCopy,
  copied,
}: {
  evidence: EvidencePackage;
  onDownload: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const isFullyVerifiable = evidence.exportContract?.mode === "fully-verifiable";
  const displayExportReasons =
    evidence.exportContract?.reasons.filter((reason) => {
      if (reason !== "missing-simulation-witness") return true;
      // Only surface this when the package is explicitly witness-only.
      // Otherwise simulation effects are still included and desktop can
      // validate execution without requiring replay-derived effects.
      return evidence.simulationWitness?.witnessOnly === true;
    }) ?? [];

  // Decode simulation events
  const nativeSymbol = DEFAULT_SETTINGS_CONFIG.chains?.[String(evidence.chainId)]?.nativeTokenSymbol ?? "ETH";
  const sim = evidence.simulation;
  const witnessOnlySimulation = evidence.simulationWitness?.witnessOnly === true;
  const logEvents = sim
    ? decodeSimulationEvents(sim.logs, evidence.safeAddress, evidence.chainId)
    : [];
  const nativeEvents = sim?.nativeTransfers?.length
    ? decodeNativeTransfers(sim.nativeTransfers, evidence.safeAddress, nativeSymbol)
    : [];
  const allEvents = [...nativeEvents, ...logEvents];
  const transfers = allEvents.filter((e) => e.kind !== "approval");
  const approvals = computeRemainingApprovals(allEvents, sim?.stateDiffs);
  const stateDiffSummary = summarizeStateDiffs(sim?.stateDiffs, allEvents, evidence.safeAddress);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Evidence Package</CardTitle>
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
            isFullyVerifiable
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
          }`}>
            {isFullyVerifiable ? "Fully verifiable" : "Partial"}
          </span>
        </div>
        <CardDescription>
          {getChainName(evidence.chainId)} · Nonce #{evidence.transaction.nonce} · {evidence.confirmations.length}/{evidence.confirmationsRequired} signatures
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Partial export reasons */}
        {evidence.exportContract?.mode === "partial" && (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {displayExportReasons.length > 0 ? (
              displayExportReasons.map((reason) => (
                <div key={reason}>· {getExportContractReasonLabel(reason)}</div>
              ))
            ) : (
              <div>· This package has partial verification coverage for this environment.</div>
            )}
          </div>
        )}

        {/* Simulation effects - the most important info, always visible */}
        {sim ? (
          <>
            <div className={`rounded-md border px-3 py-2 text-xs font-medium ${
              sim.success
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
                : "border-red-500/20 bg-red-500/5 text-red-300"
            }`}>
              Simulation {sim.success ? "succeeded" : "reverted"} at block {sim.blockNumber}
            </div>
            {transfers.length > 0 && (
              <div className="space-y-1.5">
                {transfers.map((e, i) => {
                  const colorClass =
                    e.direction === "send" ? "text-red-400"
                    : e.direction === "receive" ? "text-emerald-400"
                    : "text-muted";
                  const bgClass =
                    e.direction === "send" ? "bg-red-500/5"
                    : e.direction === "receive" ? "bg-emerald-500/5"
                    : "bg-surface-2/30";
                  const arrow =
                    e.direction === "send" ? "↗" : e.direction === "receive" ? "↙" : "↔";
                  const verb =
                    e.direction === "send" ? "Send" : e.direction === "receive" ? "Receive" : "Transfer";
                  const counterparty =
                    e.direction === "send" ? e.to : e.direction === "receive" ? e.from : e.to;
                  const preposition =
                    e.direction === "send" ? "to" : e.direction === "receive" ? "from" : "at";

                  return (
                    <div key={i} className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2 text-xs ${bgClass}`}>
                      <span className={`font-medium ${colorClass}`}>{arrow} {verb}</span>
                      <span className="font-medium">{e.amountFormatted}</span>
                      <span className="text-muted">{preposition}</span>
                      <AddressDisplay address={counterparty} />
                    </div>
                  );
                })}
              </div>
            )}
            {transfers.length === 0 && sim.success && !witnessOnlySimulation && (
              <div className="rounded-md border border-border/15 bg-surface-2/30 px-3 py-2 text-xs text-muted">
                No token movements detected.
              </div>
            )}
            {transfers.length === 0 && sim.success && witnessOnlySimulation && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                This is a witness-only package. No token movements were detected for this simulation.
              </div>
            )}
            {approvals.length > 0 && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                <div className="text-xs font-medium text-amber-200">Remaining approvals</div>
                <div className="mt-1.5 space-y-1">
                  {approvals.map((a, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-300">
                      <span className={a.isUnlimited ? "font-medium text-red-400" : "font-medium"}>
                        {a.amountFormatted}
                      </span>
                      <span className="text-amber-400/70">to</span>
                      <AddressDisplay address={a.spender} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {stateDiffSummary.totalSlotsChanged > 0 && (
              <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                <div className="text-xs font-medium text-blue-300">
                  Storage changes
                  <span className="ml-1.5 font-normal text-blue-400/70">
                    {stateDiffSummary.totalSlotsChanged} slot{stateDiffSummary.totalSlotsChanged !== 1 ? "s" : ""} across {stateDiffSummary.contractsChanged} contract{stateDiffSummary.contractsChanged !== 1 ? "s" : ""}
                  </span>
                </div>
                {stateDiffSummary.silentContracts > 0 && (
                  <div className="mt-1 text-[11px] text-amber-400">
                    {stateDiffSummary.silentContracts} contract{stateDiffSummary.silentContracts !== 1 ? "s" : ""} modified storage without emitting events — review state diffs for hidden effects.
                  </div>
                )}
                <div className="mt-1.5 space-y-1">
                  {stateDiffSummary.contracts.map((c) => (
                    <div key={c.address} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-blue-300/90">
                      <AddressDisplay address={c.address} />
                      <span className="text-blue-400/60">
                        {c.slotsChanged} slot{c.slotsChanged !== 1 ? "s" : ""}
                      </span>
                      {c.tokenSymbol && (
                        <span className="rounded bg-blue-500/10 px-1 py-0.5 text-[10px] font-medium text-blue-300">
                          {c.tokenSymbol}
                        </span>
                      )}
                      {!c.hasEvents && (
                        <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[10px] font-medium text-amber-400">
                          no events
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sim.traceAvailable === false && (
              <div className="text-xs text-amber-400">
                Event details not available, the RPC does not support debug_traceCall on this chain.
              </div>
            )}
          </>
        ) : (
          <div className="rounded-md border border-border/15 bg-surface-2/30 px-3 py-2 text-xs text-muted">
            No simulation included in this package.
          </div>
        )}

        {/* Expandable details toggle */}
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${showDetails ? "rotate-90" : ""}`} />
          {showDetails ? "Hide details" : "Show details"}
        </button>

        {showDetails && (
          <div className="space-y-2 border-t border-border/10 pt-3">
            <DetailRow label="Safe Address">
              <AddressDisplay address={evidence.safeAddress} />
            </DetailRow>
            <DetailRow label="Target">
              <AddressDisplay address={evidence.transaction.to} />
            </DetailRow>
            <DetailRow label="Safe TX Hash">
              <AddressDisplay address={evidence.safeTxHash} />
            </DetailRow>
            {evidence.onchainPolicyProof && (() => {
              const policy = evidence.onchainPolicyProof.decodedPolicy;
              const hasModules = policy.modules.length > 0;
              const hasGuard = policy.guard !== "0x0000000000000000000000000000000000000000";
              return (
                <>
                  <DetailRow label="Policy Proof">
                    <span className="text-blue-400">
                      Block {evidence.onchainPolicyProof.blockNumber}
                    </span>
                  </DetailRow>
                  <DetailRow label="Threshold">
                    <span>{policy.threshold} of {policy.owners.length}</span>
                  </DetailRow>
                  <div className="space-y-1">
                    <div className="text-xs text-muted">Owners</div>
                    {policy.owners.map((owner) => (
                      <div key={owner} className="ml-2">
                        <AddressDisplay address={owner} />
                      </div>
                    ))}
                  </div>
                  {hasModules && (
                    <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300">
                      <span className="font-medium text-amber-200">Modules — can bypass signatures</span>
                      <div className="mt-1 space-y-0.5">
                        {policy.modules.map((mod) => (
                          <div key={mod}>
                            <AddressDisplay address={mod} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {hasGuard && (
                    <DetailRow label="Guard">
                      <AddressDisplay address={policy.guard} />
                    </DetailRow>
                  )}
                </>
              );
            })()}
            {evidence.consensusProof && (() => {
              const summary = summarizeConsensusProof(evidence.consensusProof);
              return (
                <DetailRow label="Consensus Proof">
                  <span className={summary.toneClassName}>{summary.text}</span>
                </DetailRow>
              );
            })()}
            {sim && (
              <DetailRow label="Gas Used">
                <span className="font-mono">{sim.gasUsed}</span>
              </DetailRow>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button onClick={onDownload} className="flex-1">
            {isFullyVerifiable ? "Download Fully Verifiable JSON" : "Download Partial JSON"}
          </Button>
          <Button onClick={onCopy} variant="outline" className="flex-1">
            {copied ? "Copied!" : "Copy to Clipboard"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

const SAFE_MULTISIG_TX_TOPIC =
  "0x66753cd2356569ee081232e3be8909b950e0a76c1f8460c3a5e3c2be32b11bed";
const SAFE_EXECUTION_SUCCESS_TOPIC =
  "0x442e715f626346e8c54381002da614f62bee8d27386535b2521ec8540898556e";
const SAFE_EXECUTION_FAILURE_TOPIC =
  "0x23428b18acfb3ea64b08dc0c1d296ea9c09702c09083ca5272e64d115b687d23";

function logEvidenceDebugSnapshot(
  evidence: EvidencePackage,
  context: {
    rpcProvided: boolean;
    rpcUrl?: string;
    chainMismatch?: { expected: number; actual: number } | null;
    consensusProofAttempted: boolean;
    consensusProofFailed: boolean;
    onchainPolicyProofAttempted: boolean;
    onchainPolicyProofFailed: boolean;
    simulationAttempted: boolean;
    simulationFailed: boolean;
  }
): void {
  if (
    process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS !== "1" &&
    process.env.NODE_ENV !== "development"
  ) {
    return;
  }
  try {
    const sim = evidence.simulation;
    const topics = sim?.logs?.map((log) => log.topics?.[0]?.toLowerCase()).filter(Boolean) ?? [];
    const safeMultisigEventCount = topics.filter((t) => t === SAFE_MULTISIG_TX_TOPIC).length;
    const safeExecutionSuccessCount = topics.filter((t) => t === SAFE_EXECUTION_SUCCESS_TOPIC).length;
    const safeExecutionFailureCount = topics.filter((t) => t === SAFE_EXECUTION_FAILURE_TOPIC).length;
    const nativeTransferCount = sim?.nativeTransfers?.length ?? 0;

    const possibleRpcInconsistency =
      sim != null &&
      sim.success === false &&
      (safeExecutionSuccessCount > 0 || nativeTransferCount > 0);

    const label = `[SafeLens debug] ${evidence.safeTxHash.slice(0, 10)}… on chain ${evidence.chainId}`;
    console.groupCollapsed(label);
    console.info(
      "[SafeLens debug] Keep this diagnostics block. It is intentionally verbose for bug reports and should not be removed."
    );
    const contextForLog = {
      ...context,
      rpcUrl: redactRpcUrl(context.rpcUrl),
    };
    console.debug("[SafeLens debug] Bug-report identifiers:", {
      safeTxHash: evidence.safeTxHash,
      safeAddress: evidence.safeAddress,
      chainId: evidence.chainId,
      txNonce: evidence.transaction.nonce,
      packagedAt: evidence.packagedAt,
    });
    console.debug("[SafeLens debug] Enrichment context:", contextForLog);

    if (sim) {
      console.debug("[SafeLens debug] Simulation result:", {
        success: sim.success,
        returnData: sim.returnData,
        gasUsed: sim.gasUsed,
        blockNumber: sim.blockNumber,
        blockTimestamp: sim.blockTimestamp,
        traceAvailable: sim.traceAvailable,
        logCount: sim.logs.length,
        nativeTransferCount,
      });
      console.debug("[SafeLens debug] Safe execution log signals:", {
        safeMultisigEventCount,
        safeExecutionSuccessCount,
        safeExecutionFailureCount,
      });
    } else {
      console.debug("[SafeLens debug] Simulation is missing from exported evidence.");
    }

    if (evidence.simulationWitness) {
      console.debug("[SafeLens debug] Simulation witness summary:", {
        witnessOnly: evidence.simulationWitness.witnessOnly === true,
        blockNumber: evidence.simulationWitness.blockNumber,
        stateRoot: evidence.simulationWitness.stateRoot,
        overriddenSlots: evidence.simulationWitness.overriddenSlots.length,
        replayAccounts: evidence.simulationWitness.replayAccounts?.length ?? 0,
      });
    }

    if (evidence.onchainPolicyProof) {
      console.debug("[SafeLens debug] On-chain policy proof summary:", {
        blockNumber: evidence.onchainPolicyProof.blockNumber,
        stateRoot: evidence.onchainPolicyProof.stateRoot,
        threshold: evidence.onchainPolicyProof.decodedPolicy.threshold,
        owners: evidence.onchainPolicyProof.decodedPolicy.owners.length,
        nonce: evidence.onchainPolicyProof.decodedPolicy.nonce,
      });
    }

    console.debug("[SafeLens debug] Export contract summary:", evidence.exportContract);

    if (possibleRpcInconsistency) {
      console.warn(
        "[SafeLens debug] Possible RPC inconsistency: simulation.success=false while trace/log signals indicate success effects. Include this diagnostics group in bug reports."
      );
    }
    console.groupEnd();
  } catch (error) {
    console.warn("[SafeLens debug] Failed to print diagnostics:", error);
  }
}

export default function AnalyzePage() {
  const [url, setUrl] = useState("");
  const [rpcUrl, setRpcUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidencePackage | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingTxs, setPendingTxs] = useState<PendingTx[] | null>(null);
  const [safeAddress, setSafeAddress] = useState<string | null>(null);

  const [proofWarning, setProofWarning] = useState<string | null>(null);
  const [simulationWarning, setSimulationWarning] = useState<string | null>(null);
  const [consensusWarning, setConsensusWarning] = useState<string | null>(null);
  const [suggestedSimulationRpc, setSuggestedSimulationRpc] = useState<string | null>(null);

  const resolveSuggestedRpcForChain = useCallback(async (chainId: number): Promise<string> => {
    const candidates = DEFAULT_RPC_CANDIDATES[chainId];
    if (!candidates) return "";

    const [primary, secondary] = candidates;
    const primaryOk = await pingRpcChainId(primary, chainId);
    return primaryOk ? primary : secondary;
  }, []);
  /** Optionally enrich a package with on-chain policy proof, simulation, and consensus proof. */
  const maybeEnrich = async (
    pkg: EvidencePackage,
    options?: { overrideRpcUrl?: string; showMissingSimulationWarning?: boolean }
  ): Promise<EvidencePackage> => {
    let enriched = pkg;
    const resolvedRpcUrl = options?.overrideRpcUrl?.trim() ?? rpcUrl.trim();
    const rpcProvided = Boolean(resolvedRpcUrl);
    const { consensusMode, shouldAttemptConsensusProof } = buildConsensusEnrichmentPlan(pkg.chainId);
    let consensusProofAttempted = false;
    let consensusProofFailed = false;
    let consensusProofUnsupportedMode = false;
    let consensusProofDisabledByFeatureFlag = false;
    let onchainPolicyProofFailed = false;
    let simulationFailed = false;
    let onchainPolicyProofAttempted = false;
    let simulationAttempted = false;
    let witnessGenerationError: string | undefined;

    if (!rpcProvided) {
      setSuggestedSimulationRpc(null);
      if (options?.showMissingSimulationWarning !== false) {
        const suggestedRpc = await resolveSuggestedRpcForChain(pkg.chainId);
        if (suggestedRpc) {
          setSuggestedSimulationRpc(suggestedRpc);
          setSimulationWarning(
            `On-chain simulation data is missing. It is available for ${getChainName(pkg.chainId)} via ${suggestedRpc}.`
          );
        }
      }
    } else {
      setSuggestedSimulationRpc(null);

      const rpcChainId = await fetchRpcChainId(resolvedRpcUrl);
      if (rpcChainId !== null && rpcChainId !== pkg.chainId) {
        const suggestedRpc = await resolveSuggestedRpcForChain(pkg.chainId);
        if (suggestedRpc) {
          setSuggestedSimulationRpc(suggestedRpc);
        }
        setSimulationWarning(null);
        setProofWarning(
          `RPC chain mismatch: this transaction is on ${getChainName(pkg.chainId)} (chain ${pkg.chainId}), but the provided RPC is ${getChainName(rpcChainId)} (chain ${rpcChainId}). ` +
          (suggestedRpc
            ? `Retry with the built-in ${getChainName(pkg.chainId)} RPC: ${suggestedRpc}`
            : "Please provide an RPC URL for the transaction chain and retry.")
        );

        const finalized = finalizeEvidenceExport(enriched, {
          rpcProvided,
          consensusProofAttempted,
          consensusProofFailed,
          consensusProofUnsupportedMode,
          consensusProofDisabledByFeatureFlag,
          onchainPolicyProofAttempted: true,
          onchainPolicyProofFailed: true,
          simulationAttempted: true,
          simulationFailed: true,
        });
        logEvidenceDebugSnapshot(finalized, {
          rpcProvided,
          rpcUrl: resolvedRpcUrl,
          chainMismatch: { expected: pkg.chainId, actual: rpcChainId },
          consensusProofAttempted,
          consensusProofFailed,
          onchainPolicyProofAttempted: true,
          onchainPolicyProofFailed: true,
          simulationAttempted: true,
          simulationFailed: true,
        });
        return finalized;
      }
    }

    // Fetch consensus proof first so policy proof can be pinned to the same
    // finalized execution block.
    if (shouldAttemptConsensusProof) {
      consensusProofAttempted = true;
      try {
        enriched = await enrichWithConsensusProof(enriched, {
          rpcUrl:
            (consensusMode === "opstack" || consensusMode === "linea") &&
            rpcProvided
              ? resolvedRpcUrl
              : undefined,
          enableExperimentalLineaConsensus: lineaConsensusEnabled,
          enableExperimentalOpstackConsensus: opstackConsensusEnabled,
        });
      } catch (err) {
        consensusProofFailed = true;
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          err.code === UNSUPPORTED_CONSENSUS_MODE_ERROR_CODE
        ) {
          if ("reason" in err && err.reason === "disabled-by-feature-flag") {
            consensusProofDisabledByFeatureFlag = true;
          } else {
            consensusProofUnsupportedMode = true;
          }
        }
        console.warn("Failed to fetch consensus proof:", err);
        setConsensusWarning(
          `Consensus proof failed: ${err instanceof Error ? err.message : "Unknown error"}. Evidence created without consensus verification data.`
        );
      }
    }

    if (rpcProvided) {
      onchainPolicyProofAttempted = true;
      try {
        enriched = await enrichWithOnchainProof(enriched, {
          rpcUrl: resolvedRpcUrl,
          blockNumber: enriched.consensusProof?.blockNumber,
        });
      } catch (err) {
        onchainPolicyProofFailed = true;
        console.warn("Failed to fetch on-chain policy proof:", err);
        setProofWarning(
          `Policy proof failed: ${err instanceof Error ? err.message : "Unknown error"}. Evidence created without proof.`
        );
      }

      simulationAttempted = true;
      try {
        const simulationResult = await enrichWithSimulation(enriched, {
          rpcUrl: resolvedRpcUrl,
          blockNumber: enriched.onchainPolicyProof?.blockNumber,
        });
        enriched = simulationResult.evidence;
        witnessGenerationError = simulationResult.witnessGenerationError;
      } catch (err) {
        simulationFailed = true;
        console.warn("Failed to simulate transaction:", err);
        setSimulationWarning(
          `Simulation failed: ${err instanceof Error ? err.message : "Unknown error"}. Evidence created without simulation.`
        );
      }
    }

    const finalized = finalizeEvidenceExport(enriched, {
      rpcProvided,
      consensusProofAttempted,
      consensusProofFailed,
      consensusProofUnsupportedMode,
      consensusProofDisabledByFeatureFlag,
      onchainPolicyProofAttempted,
      onchainPolicyProofFailed,
      simulationAttempted,
      simulationFailed,
      witnessGenerationError,
    });
    logEvidenceDebugSnapshot(finalized, {
      rpcProvided,
      rpcUrl: resolvedRpcUrl || undefined,
      chainMismatch: null,
      consensusProofAttempted,
      consensusProofFailed,
      onchainPolicyProofAttempted,
      onchainPolicyProofFailed,
      simulationAttempted,
      simulationFailed,
    });
    return finalized;
  };

  const handleAnalyze = async () => {
    setError(null);
    setProofWarning(null);
    setSimulationWarning(null);
    setConsensusWarning(null);
    setSuggestedSimulationRpc(null);
    setEvidence(null);
    setPendingTxs(null);
    setSafeAddress(null);
    setLoading(true);

    try {
      const input = url.trim();
      const rawAddress = extractAddress(input);

      if (rawAddress) {
        // Raw address: query all supported chains in parallel
        const results = await Promise.allSettled(
          SUPPORTED_CHAIN_IDS.map(async (chainId) => {
            const txs = await fetchPendingTransactions(chainId, rawAddress);
            return txs.map((tx): PendingTx => ({ ...tx, _chainId: chainId }));
          })
        );

        const allTxs = results.flatMap((r) =>
          r.status === "fulfilled" ? r.value : []
        );

        if (allTxs.length === 0) {
          setError("No pending transactions found for this address on any supported chain.");
          return;
        }

        setPendingTxs(allTxs);
        setSafeAddress(rawAddress);
      } else {
        const result = parseSafeUrlFlexible(input);

        if (result.type === "transaction") {
          const tx = await fetchSafeTransaction(result.data.chainId, result.data.safeTxHash);
          let pkg = createEvidencePackage(tx, result.data.chainId, input);
          pkg = await maybeEnrich(pkg);
          setEvidence(pkg);
        } else {
          const txs = await fetchPendingTransactions(result.data.chainId, result.data.safeAddress);
          if (txs.length === 0) {
            setError("No pending transactions found for this Safe.");
            return;
          }
          setPendingTxs(txs.map((tx): PendingTx => ({ ...tx, _chainId: result.data.chainId })));
          setSafeAddress(result.data.safeAddress);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze transaction");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTransaction = async (tx: PendingTx) => {
    setLoading(true);
    setPendingTxs(null);
    setEvidence(null);
    setError(null);
    setProofWarning(null);
    setSimulationWarning(null);
    setConsensusWarning(null);
    setSuggestedSimulationRpc(null);

    try {
      const prefix = getChainPrefix(tx._chainId);
      const addr = safeAddress ?? tx.safe;
      const syntheticUrl = `https://app.safe.global/transactions/tx?safe=${prefix}:${addr}&id=multisig_${addr}_${tx.safeTxHash}`;
      let pkg = createEvidencePackage(tx, tx._chainId, syntheticUrl);
      pkg = await maybeEnrich(pkg);
      setEvidence(pkg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create evidence package");
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

  const handleRetrySimulationWithSuggestedRpc = async () => {
    if (!evidence || !suggestedSimulationRpc) return;

    setLoading(true);
    setError(null);
    setProofWarning(null);
    setSimulationWarning(null);
    setConsensusWarning(null);

    try {
      const enriched = await maybeEnrich(evidence, {
        overrideRpcUrl: suggestedSimulationRpc,
        showMissingSimulationWarning: false,
      });
      setEvidence(enriched);
      setRpcUrl(suggestedSimulationRpc);
      setSuggestedSimulationRpc(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry on-chain enrichment");
    } finally {
      setLoading(false);
    }
  };

  // Group pending txs by chain for display
  const txsByChain = pendingTxs
    ? Array.from(
        pendingTxs.reduce((map, tx) => {
          const arr = map.get(tx._chainId) ?? [];
          arr.push(tx);
          map.set(tx._chainId, arr);
          return map;
        }, new Map<number, PendingTx[]>())
      )
    : null;

  const multipleChains = txsByChain ? txsByChain.length > 1 : false;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Generate Evidence</h1>
        <p className="text-muted">
          Paste a Safe transaction URL or address to build a portable evidence package.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Transaction URL or Safe Address</CardTitle>
          <CardDescription>
            Paste a transaction URL, a queue URL, or a Safe address (0x...)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="0x... or https://app.safe.global/transactions/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleAnalyze} disabled={loading || !url}>
              {loading ? "Searching..." : "Analyze"}
            </Button>
          </div>
          <div>
            <Input
              type="text"
              placeholder="RPC URL (optional, enables on-chain policy proof)"
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              className="text-xs"
            />
            <p className="mt-1 text-xs text-muted">
              Optional. Leave blank to generate quickly without simulation; SafeLens can suggest a chain RPC and let you retry enrichment.
            </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {txsByChain && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Select a Transaction</CardTitle>
            <CardDescription>
              {pendingTxs!.length} pending transaction{pendingTxs!.length !== 1 ? "s" : ""} found{multipleChains ? " across multiple chains" : ` on ${getChainName(txsByChain[0][0])}`}. Pick one to generate evidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {txsByChain.map(([chainId, txs]) => (
              <div key={chainId}>
                {multipleChains && (
                  <div className="mb-2 text-xs font-medium text-muted">{getChainName(chainId)}</div>
                )}
                <div className="space-y-2">
                  {txs.map((tx) => (
                    <button
                      key={tx.safeTxHash}
                      onClick={() => handleSelectTransaction(tx)}
                      className="w-full rounded-md border border-border/15 bg-surface-2/40 p-3 text-left transition-colors hover:bg-surface-2/70"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-medium">#{tx.nonce}</span>
                          <span className="font-mono text-xs text-muted">
                            {tx.to.slice(0, 6)}...{tx.to.slice(-4)}
                          </span>
                          {tx.dataDecoded?.method && (
                            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium">
                              {tx.dataDecoded.method}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted">
                          {tx.confirmations.length >= tx.confirmationsRequired ? (
                            <span className="flex items-center gap-1 text-green-400">
                              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>
                              {tx.confirmations.length}/{tx.confirmationsRequired}
                            </span>
                          ) : (
                            <span>
                              {tx.confirmations.length}/{tx.confirmationsRequired} sigs
                            </span>
                          )}
                          <span>{new Date(tx.submissionDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {proofWarning && (
        <Alert className="mb-6 border-amber-500/20 bg-amber-500/10 text-amber-200">
          <AlertTitle>Policy Proof Warning</AlertTitle>
          <AlertDescription className="space-y-2">
            <div>{proofWarning}</div>
            {suggestedSimulationRpc && evidence && (
              <Button
                type="button"
                variant="outline"
                className="h-8 border-amber-500/30 bg-transparent text-xs text-amber-100 hover:bg-amber-500/10"
                onClick={handleRetrySimulationWithSuggestedRpc}
                disabled={loading}
              >
                Retry using {suggestedSimulationRpc}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {simulationWarning && (
        <Alert className="mb-6 border-amber-500/20 bg-amber-500/10 text-amber-200">
          <AlertTitle>Simulation Warning</AlertTitle>
          <AlertDescription className="space-y-2">
            <div>{simulationWarning}</div>
            {suggestedSimulationRpc && evidence && (
              <Button
                type="button"
                variant="outline"
                className="h-8 border-amber-500/30 bg-transparent text-xs text-amber-100 hover:bg-amber-500/10"
                onClick={handleRetrySimulationWithSuggestedRpc}
                disabled={loading}
              >
                Retry using {suggestedSimulationRpc}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {consensusWarning && (
        <Alert className="mb-6 border-amber-500/20 bg-amber-500/10 text-amber-200">
          <AlertTitle>Consensus Proof Warning</AlertTitle>
          <AlertDescription>{consensusWarning}</AlertDescription>
        </Alert>
      )}

      {!evidence && !pendingTxs && !loading && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Trust Assumptions</CardTitle>
            <CardDescription>
              Every input used to build evidence, with explicit trust level.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {generationSources.map((source) => {
              const trust = TRUST_CONFIG[source.trust];
              return (
                <div
                  key={source.id}
                  className="rounded-md border border-border/15 bg-surface-2/40 p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{source.title}</span>
                    <span className={`text-xs ${trust.color}`}>{trust.label}</span>
                  </div>
                  <p className="text-xs text-muted">{source.summary}</p>
                  <p className="mt-1 text-xs text-muted">{source.detail}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {evidence && <EvidenceDisplay
        evidence={evidence}
        onDownload={handleDownload}
        onCopy={handleCopy}
        copied={copied}
      />}
    </div>
  );
}
