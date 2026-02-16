import type { SafePolicyChangeDetails } from "@safelens/core";
import type { EvidenceContext } from "./registry";
import { AddressDisplay } from "@/components/address-display";
import { AlertTriangle, Info, AlertCircle } from "lucide-react";

interface SafePolicyCardProps {
  details: SafePolicyChangeDetails;
  context?: EvidenceContext;
}

const CHANGE_DESCRIPTIONS: Record<string, string> = {
  changeThreshold: "This transaction changes how many signatures are required to execute transactions.",
  addOwnerWithThreshold: "This transaction adds a new signer to the Safe.",
  removeOwner: "This transaction removes a signer from the Safe.",
  swapOwner: "This transaction replaces one signer with another.",
};

const WarningIcon = ({ level }: { level: "info" | "warning" | "critical" }) => {
  switch (level) {
    case "critical":
      return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />;
    case "warning":
      return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />;
    case "info":
      return <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />;
  }
};

const WarningBox = ({ level, title, description }: { level: "info" | "warning" | "critical"; title: string; description: string }) => {
  const styles = {
    critical: "border-red-500/25 bg-red-500/10 text-red-300",
    warning: "border-yellow-500/25 bg-yellow-500/10 text-yellow-300",
    info: "border-blue-500/25 bg-blue-500/10 text-blue-300",
  };

  return (
    <div className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 ${styles[level]}`}>
      <WarningIcon level={level} />
      <div className="flex-1 space-y-1">
        <div className="text-xs font-medium">{title}</div>
        <div className="text-xs leading-relaxed opacity-90">{description}</div>
      </div>
    </div>
  );
};

export function SafePolicyCard({ details, context }: SafePolicyCardProps) {
  const showThresholdChange =
    details.newThreshold !== undefined &&
    context?.currentThreshold !== undefined &&
    details.newThreshold !== context.currentThreshold;

  return (
    <div className="space-y-3 text-sm">
      {/* Display all warnings */}
      {details.warnings && details.warnings.length > 0 ? (
        details.warnings.map((warning, idx) => (
          <WarningBox
            key={idx}
            level={warning.level}
            title={warning.title}
            description={warning.description}
          />
        ))
      ) : (
        /* Fallback to default warning if no warnings provided */
        <div className="flex items-start gap-2.5 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span className="text-xs leading-relaxed text-red-300">
            {CHANGE_DESCRIPTIONS[details.changeType] ?? "This transaction modifies the Safe's signing policy."}
          </span>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <span className="font-medium text-muted">Safe</span>
          <div><AddressDisplay address={details.safeAddress} /></div>
        </div>

        {details.newThreshold !== undefined && (
          <div>
            <span className="font-medium text-muted">Threshold</span>
            <div className="flex items-center gap-2 font-mono">
              {showThresholdChange ? (
                <>
                  <span>{context!.currentThreshold}</span>
                  <span className="text-muted">&rarr;</span>
                  <span>{details.newThreshold}</span>
                </>
              ) : (
                <span>{details.newThreshold}</span>
              )}
            </div>
          </div>
        )}

        {details.newOwner && (
          <div>
            <span className="font-medium text-muted">
              {details.changeType === "swapOwner" ? "New Owner" : "Owner Added"}
            </span>
            <div><AddressDisplay address={details.newOwner} /></div>
          </div>
        )}

        {details.removedOwner && (
          <div>
            <span className="font-medium text-muted">
              {details.changeType === "swapOwner" ? "Replaced Owner" : "Owner Removed"}
            </span>
            <div><AddressDisplay address={details.removedOwner} /></div>
          </div>
        )}
      </div>
    </div>
  );
}
