import type { ERC20TransferDetails } from "@safelens/core";
import { AddressDisplay } from "@/components/address-display";

interface ERC20TransferCardProps {
  details: ERC20TransferDetails;
}

export function ERC20TransferCard({ details }: ERC20TransferCardProps) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <span className="font-medium text-muted">Token</span>
          <div>
            {details.token.symbol ? (
              <span className="font-mono">{details.token.symbol}</span>
            ) : (
              <AddressDisplay address={details.token.address} />
            )}
          </div>
        </div>
        <div>
          <span className="font-medium text-muted">Amount</span>
          <div className="font-mono">{details.amountFormatted}</div>
        </div>

        {details.actionType === "transfer" && details.to && (
          <div className="col-span-2">
            <span className="font-medium text-muted">Recipient</span>
            <div><AddressDisplay address={details.to} /></div>
          </div>
        )}

        {details.actionType === "approve" && details.spender && (
          <div className="col-span-2">
            <span className="font-medium text-muted">Spender</span>
            <div><AddressDisplay address={details.spender} /></div>
          </div>
        )}

        {details.actionType === "transferFrom" && (
          <>
            {details.from && (
              <div>
                <span className="font-medium text-muted">From</span>
                <div><AddressDisplay address={details.from} /></div>
              </div>
            )}
            {details.to && (
              <div>
                <span className="font-medium text-muted">To</span>
                <div><AddressDisplay address={details.to} /></div>
              </div>
            )}
          </>
        )}
      </div>

      {details.isUnlimitedApproval && (
        <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
          <span className="text-xs font-medium text-amber-400">Unlimited Approval</span>
          <p className="text-xs text-amber-300/80">
            This approval grants unlimited spending rights to the spender address.
          </p>
        </div>
      )}
    </div>
  );
}
