import type { CowSwapTwapDetails } from "@/lib/interpret";
import { AddressDisplay } from "@/components/address-display";

interface CowSwapTwapCardProps {
  details: CowSwapTwapDetails;
}

export function CowSwapTwapCard({ details }: CowSwapTwapCardProps) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <span className="font-medium text-muted">Sell Token</span>
          <div>
            {details.sellToken.symbol ? (
              <span className="font-mono">{details.sellToken.symbol}</span>
            ) : (
              <AddressDisplay address={details.sellToken.address} />
            )}
          </div>
        </div>
        <div>
          <span className="font-medium text-muted">Buy Token</span>
          <div>
            {details.buyToken.symbol ? (
              <span className="font-mono">{details.buyToken.symbol}</span>
            ) : (
              <AddressDisplay address={details.buyToken.address} />
            )}
          </div>
        </div>
        <div>
          <span className="font-medium text-muted">Total Sell Amount</span>
          <div className="font-mono">{details.totalSellAmountFormatted}</div>
        </div>
        <div>
          <span className="font-medium text-muted">Min Buy Per Part</span>
          <div className="font-mono">{details.minPartLimitFormatted}</div>
        </div>
        <div>
          <span className="font-medium text-muted">Parts</span>
          <div className="font-mono">{details.numberOfParts}</div>
        </div>
        <div>
          <span className="font-medium text-muted">Sell Per Part</span>
          <div className="font-mono">{details.partSellAmountFormatted}</div>
        </div>
        <div>
          <span className="font-medium text-muted">Interval</span>
          <div className="font-mono">{details.timeBetweenPartsFormatted}</div>
        </div>
        <div>
          <span className="font-medium text-muted">Total Duration</span>
          <div className="font-mono">{details.totalDurationFormatted}</div>
        </div>
        <div>
          <span className="font-medium text-muted">Receiver</span>
          <div><AddressDisplay address={details.receiver} /></div>
        </div>
      </div>

      {details.approval && (
        <div className="rounded border border-accent/20 bg-accent/5 p-2">
          <span className="text-xs font-medium text-muted">Token Approval</span>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="font-mono">Approve {details.approval.amountFormatted}</span>
            {details.approval.token.symbol ? (
              <span className="font-mono">{details.approval.token.symbol}</span>
            ) : (
              <AddressDisplay address={details.approval.token.address} />
            )}
            <span>to</span>
            <AddressDisplay address={details.approval.spender} />
          </div>
        </div>
      )}
    </div>
  );
}
