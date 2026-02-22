import { useState } from "react";
import { ChevronRight, Copy, Check } from "lucide-react";
import type { SafeTxHashDetails } from "@safelens/core";

// ── Combined component ───────────────────────────────────────────────

interface HashVerificationDetailsProps {
  safeTxHash: string;
  details?: SafeTxHashDetails;
}

function useCopyToClipboard() {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };
  return { copiedField, copy };
}

function CopyButton({ text, field, copiedField, onCopy }: {
  text: string;
  field: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  return (
    <button
      onClick={() => onCopy(text, field)}
      className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 shrink-0"
    >
      {copiedField === field ? (
        <Check className="h-3 w-3" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

/** Hash value + copy button (no expandable section) */
export function HashValueDisplay({ hash }: { hash: string }) {
  const { copiedField, copy } = useCopyToClipboard();
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-xs">{hash}</code>
      <button
        onClick={() => copy(hash, "hash")}
        className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
      >
        {copiedField === "hash" ? (
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
  );
}

/** Expandable intermediate hashes for hardware wallet verification */
export function IntermediateHashesDetails({ details }: { details: SafeTxHashDetails }) {
  const [expanded, setExpanded] = useState(false);
  const { copiedField, copy } = useCopyToClipboard();

  return (
    <div className={expanded ? "" : "pb-1"}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-fg transition-colors"
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
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
              <CopyButton text={details.domainSeparator} field="domainSeparator" copiedField={copiedField} onCopy={copy} />
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
              <CopyButton text={details.messageHash} field="messageHash" copiedField={copiedField} onCopy={copy} />
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

/**
 * Combined hash display + expandable intermediate hashes.
 * Kept for backwards compatibility.
 */
export function HashVerificationDetails({ safeTxHash, details }: HashVerificationDetailsProps) {
  if (!details) {
    return (
      <div className="space-y-2">
        <HashValueDisplay hash={safeTxHash} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <HashValueDisplay hash={details.safeTxHash} />
      <IntermediateHashesDetails details={details} />
    </div>
  );
}
