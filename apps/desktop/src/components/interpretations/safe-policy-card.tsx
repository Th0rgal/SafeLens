import type { SafePolicyChangeDetails } from "@safelens/core";
import { AddressDisplay } from "@/components/address-display";
import { AlertTriangle } from "lucide-react";

interface SafePolicyCardProps {
  details: SafePolicyChangeDetails;
}

const CHANGE_DESCRIPTIONS: Record<string, string> = {
  changeThreshold: "This transaction changes how many signatures are required to execute transactions.",
  addOwnerWithThreshold: "This transaction adds a new signer to the Safe.",
  removeOwner: "This transaction removes a signer from the Safe.",
  swapOwner: "This transaction replaces one signer with another.",
};

export function SafePolicyCard({ details }: SafePolicyCardProps) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start gap-2.5 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <span className="text-xs leading-relaxed text-red-300">
          {CHANGE_DESCRIPTIONS[details.changeType] ?? "This transaction modifies the Safe's signing policy."}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <span className="font-medium text-red-400/60">Safe</span>
          <div><AddressDisplay address={details.safeAddress} /></div>
        </div>

        {details.newThreshold !== undefined && (
          <div>
            <span className="font-medium text-red-400/60">New Threshold</span>
            <div className="font-mono text-red-300">{details.newThreshold}</div>
          </div>
        )}

        {details.newOwner && (
          <div>
            <span className="font-medium text-red-400/60">
              {details.changeType === "swapOwner" ? "New Owner" : "Owner Added"}
            </span>
            <div><AddressDisplay address={details.newOwner} /></div>
          </div>
        )}

        {details.removedOwner && (
          <div>
            <span className="font-medium text-red-400/60">
              {details.changeType === "swapOwner" ? "Replaced Owner" : "Owner Removed"}
            </span>
            <div><AddressDisplay address={details.removedOwner} /></div>
          </div>
        )}
      </div>
    </div>
  );
}
