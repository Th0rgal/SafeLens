import type { SafePolicyChangeDetails } from "@safelens/core";
import { AddressDisplay } from "@/components/address-display";
import { AlertTriangle } from "lucide-react";

interface SafePolicyCardProps {
  details: SafePolicyChangeDetails;
}

const CHANGE_LABELS: Record<string, string> = {
  changeThreshold: "Signing Threshold Change",
  addOwnerWithThreshold: "New Owner Addition",
  removeOwner: "Owner Removal",
  swapOwner: "Owner Replacement",
};

export function SafePolicyCard({ details }: SafePolicyCardProps) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium">
          {CHANGE_LABELS[details.changeType] ?? "Policy Change"} — this modifies who can sign transactions for this Safe
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <span className="font-medium text-muted">Safe</span>
          <div><AddressDisplay address={details.safeAddress} /></div>
        </div>

        {details.newThreshold !== undefined && (
          <div>
            <span className="font-medium text-muted">New Threshold</span>
            <div className="font-mono text-red-400">{details.newThreshold}</div>
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
            <div className="text-red-400"><AddressDisplay address={details.removedOwner} /></div>
          </div>
        )}
      </div>
    </div>
  );
}
