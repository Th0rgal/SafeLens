import type { CowSwapPreSignDetails } from "@safelens/core";
import { AddressDisplay } from "@/components/address-display";

interface CowSwapPreSignCardProps {
  details: CowSwapPreSignDetails;
}

export function CowSwapPreSignCard({ details }: CowSwapPreSignCardProps) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <span className="font-medium text-muted">Action</span>
          <div className="font-mono">{details.signed ? "Sign Order" : "Cancel Order"}</div>
        </div>
        <div>
          <span className="font-medium text-muted">Expires</span>
          <div className="font-mono">{details.validToFormatted}</div>
        </div>
        <div className="col-span-2">
          <span className="font-medium text-muted">Order Digest</span>
          <div className="font-mono text-xs break-all">{details.orderDigest}</div>
        </div>
        <div className="col-span-2">
          <span className="font-medium text-muted">Owner</span>
          <div>
            <AddressDisplay address={details.owner} />
          </div>
        </div>
        <div className="col-span-2">
          <span className="font-medium text-muted">Settlement Contract</span>
          <div>
            <AddressDisplay address={details.settlementContract} />
          </div>
        </div>
      </div>
    </div>
  );
}
