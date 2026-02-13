import type { ERC7730Details } from "@safelens/core";
import type { EvidenceContext } from "./registry";
import { AddressDisplay } from "@/components/address-display";

interface ERC7730CardProps {
  details: ERC7730Details;
  context?: EvidenceContext;
}

/**
 * Generic card component for ERC-7730 interpretations.
 *
 * Renders fields dynamically based on their format type, with format-aware
 * rendering for addresses, amounts, dates, etc.
 */
export function ERC7730Card({ details }: ERC7730CardProps) {
  return (
    <div className="space-y-3 text-sm">
      {details.fields.map((field, index) => (
        <div key={index}>
          <span className="font-medium text-muted">{field.label}</span>
          <div>
            {field.format === "addressName" ? (
              <AddressDisplay address={field.value} />
            ) : field.format === "tokenAmount" ||
              field.format === "amount" ? (
              <span className="font-mono">{field.value}</span>
            ) : (
              <span>{field.value}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
