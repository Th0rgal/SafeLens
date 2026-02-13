import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import type { SafeTxHashDetails } from "@safelens/core";

interface HashVerificationDetailsProps {
  safeTxHash: string;
  details?: SafeTxHashDetails;
}

/**
 * Display detailed hash verification information
 * Shows intermediate hashes (domain separator and message hash)
 * for hardware wallet verification (Ledger/Trezor)
 */
export function HashVerificationDetails({ safeTxHash, details }: HashVerificationDetailsProps) {
  const [expanded, setExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!details) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs">{safeTxHash}</code>
          <button
            onClick={() => copyToClipboard(safeTxHash, "safeTxHash")}
            className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
          >
            {copiedField === "safeTxHash" ? (
              <>
                <Check className="h-3 w-3" /> Copied!
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Copy
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Final hash */}
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs">{details.safeTxHash}</code>
        <button
          onClick={() => copyToClipboard(details.safeTxHash, "safeTxHash")}
          className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
        >
          {copiedField === "safeTxHash" ? (
            <>
              <Check className="h-3 w-3" /> Copied!
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>

      {/* Expandable section for intermediate hashes */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        Show intermediate hashes for hardware wallet verification
      </button>

      {expanded && (
        <div className="mt-2 space-y-3 rounded-md border border-border/15 glass-subtle p-3">
          <div className="text-xs text-muted">
            These intermediate hashes match what Ledger/Trezor displays during signing:
          </div>

          {/* Domain separator */}
          <div>
            <div className="mb-1 text-xs font-medium text-muted">
              Domain Separator
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all text-xs font-mono">
                {details.domainSeparator}
              </code>
              <button
                onClick={() => copyToClipboard(details.domainSeparator, "domainSeparator")}
                className="text-xs text-accent hover:text-accent-hover shrink-0"
              >
                {copiedField === "domainSeparator" ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
            <div className="mt-1 text-xs text-muted/70">
              EIP-712 domain separator (chainId + Safe address)
            </div>
          </div>

          {/* Message hash */}
          <div>
            <div className="mb-1 text-xs font-medium text-muted">
              Message Hash
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all text-xs font-mono">
                {details.messageHash}
              </code>
              <button
                onClick={() => copyToClipboard(details.messageHash, "messageHash")}
                className="text-xs text-accent hover:text-accent-hover shrink-0"
              >
                {copiedField === "messageHash" ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
            <div className="mt-1 text-xs text-muted/70">
              SafeTx struct hash (transaction parameters)
            </div>
          </div>

          {/* Final hash computation explanation */}
          <div className="text-xs text-muted/70 border-t border-border/15 pt-2">
            Final hash = keccak256(0x1901 || domainSeparator || messageHash)
          </div>
        </div>
      )}
    </div>
  );
}
