"use client";

import { useState, useCallback } from "react";
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
  decodeSimulationEvents,
  buildGenerationSources,
  TRUST_CONFIG,
  SUPPORTED_CHAIN_IDS,
} from "@safelens/core";
import { downloadEvidencePackage } from "@/lib/download";
import { AddressDisplay } from "@/components/address-display";
import type { EvidencePackage, SafeTransaction } from "@safelens/core";

const generationSources = buildGenerationSources();

type PendingTx = SafeTransaction & { _chainId: number };

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function extractAddress(input: string): string | null {
  const trimmed = input.trim();
  if (ADDRESS_RE.test(trimmed)) return trimmed;
  // Also match if user pasted with surrounding quotes or whitespace
  const match = trimmed.match(/0x[a-fA-F0-9]{40}/);
  return match && !trimmed.startsWith("http") ? match[0] : null;
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

  /** Optionally enrich a package with on-chain policy proof + simulation. */
  const maybeEnrich = async (pkg: EvidencePackage): Promise<EvidencePackage> => {
    const trimmedRpc = rpcUrl.trim();
    if (!trimmedRpc) return pkg;

    let enriched = pkg;

    try {
      enriched = await enrichWithOnchainProof(enriched, { rpcUrl: trimmedRpc });
    } catch (err) {
      console.warn("Failed to fetch on-chain policy proof:", err);
      setProofWarning(
        `Policy proof failed: ${err instanceof Error ? err.message : "Unknown error"}. Evidence created without proof.`
      );
    }

    try {
      enriched = await enrichWithSimulation(enriched, { rpcUrl: trimmedRpc });
    } catch (err) {
      console.warn("Failed to simulate transaction:", err);
      setSimulationWarning(
        `Simulation failed: ${err instanceof Error ? err.message : "Unknown error"}. Evidence created without simulation.`
      );
    }

    // Always attempt consensus proof (uses public beacon RPCs, no user RPC needed)
    try {
      enriched = await enrichWithConsensusProof(enriched);
    } catch (err) {
      console.warn("Failed to fetch consensus proof:", err);
      setConsensusWarning(
        `Consensus proof failed: ${err instanceof Error ? err.message : "Unknown error"}. Evidence created without consensus verification data.`
      );
    }

    return enriched;
  };

  const handleAnalyze = async () => {
    setError(null);
    setProofWarning(null);
    setSimulationWarning(null);
    setConsensusWarning(null);
    setEvidence(null);
    setPendingTxs(null);
    setSafeAddress(null);
    setLoading(true);

    try {
      const input = url.trim();
      const rawAddress = extractAddress(input);

      if (rawAddress) {
        // Raw address — query all supported chains in parallel
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
              placeholder="RPC URL (optional — enables on-chain policy proof)"
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              className="text-xs"
            />
            <p className="mt-1 text-xs text-muted">
              Provide an Ethereum RPC URL to include a cryptographic policy proof (owners, threshold, modules) via eth_getProof.
            </p>
          </div>
        </CardContent>
      </Card>

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
          <AlertDescription>{proofWarning}</AlertDescription>
        </Alert>
      )}

      {simulationWarning && (
        <Alert className="mb-6 border-amber-500/20 bg-amber-500/10 text-amber-200">
          <AlertTitle>Simulation Warning</AlertTitle>
          <AlertDescription>{simulationWarning}</AlertDescription>
        </Alert>
      )}

      {consensusWarning && (
        <Alert className="mb-6 border-amber-500/20 bg-amber-500/10 text-amber-200">
          <AlertTitle>Consensus Proof Warning</AlertTitle>
          <AlertDescription>{consensusWarning}</AlertDescription>
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
                <div className="font-medium text-muted">Nonce</div>
                <div className="font-mono">{evidence.transaction.nonce}</div>
              </div>
              <div>
                <div className="font-medium text-muted">Safe Address</div>
                <AddressDisplay address={evidence.safeAddress} />
              </div>
              <div>
                <div className="font-medium text-muted">Target</div>
                <AddressDisplay address={evidence.transaction.to} />
              </div>
              <div>
                <div className="font-medium text-muted">Signatures</div>
                <div className="font-mono">
                  {evidence.confirmations.length} / {evidence.confirmationsRequired}
                </div>
              </div>
              <div className="col-span-2">
                <div className="font-medium text-muted">Safe TX Hash</div>
                <AddressDisplay address={evidence.safeTxHash} />
              </div>
              {evidence.onchainPolicyProof && (
                <div className="col-span-2">
                  <div className="font-medium text-muted">Policy Proof</div>
                  <div className="text-xs text-blue-400">
                    Included (block {evidence.onchainPolicyProof.blockNumber}, {evidence.onchainPolicyProof.decodedPolicy.owners.length} owners, threshold {evidence.onchainPolicyProof.decodedPolicy.threshold})
                  </div>
                </div>
              )}
              {evidence.simulation && (() => {
                const events = decodeSimulationEvents(
                  evidence.simulation.logs,
                  evidence.safeAddress,
                  evidence.chainId,
                );
                return (
                  <div className="col-span-2">
                    <div className="font-medium text-muted">Simulation</div>
                    <div className={`text-xs ${evidence.simulation.success ? "text-green-400" : "text-red-400"}`}>
                      {evidence.simulation.success ? "Success" : "Reverted"} (block {evidence.simulation.blockNumber}, gas {evidence.simulation.gasUsed})
                    </div>
                    {events.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {events.map((e, i) => (
                          <div key={i} className={`text-xs rounded px-2 py-1 ${
                            e.direction === "send" ? "bg-red-500/10 text-red-400" :
                            e.direction === "receive" ? "bg-green-500/10 text-green-400" :
                            "bg-gray-500/10 text-gray-400"
                          }`}>
                            {e.direction === "send" ? "↗ Send" :
                             e.direction === "receive" ? "↙ Receive" :
                             e.kind === "approval" ? "🔑 Approve" :
                             "↔ Internal"}{" "}
                            <span className="font-medium">{e.amountFormatted}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              {evidence.consensusProof && (
                <div className="col-span-2">
                  <div className="font-medium text-muted">Consensus Proof</div>
                  <div className="text-xs text-green-400">
                    Included ({evidence.consensusProof.network}, block {evidence.consensusProof.blockNumber}, {evidence.consensusProof.updates.length} sync committee update{evidence.consensusProof.updates.length !== 1 ? "s" : ""})
                  </div>
                </div>
              )}
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
