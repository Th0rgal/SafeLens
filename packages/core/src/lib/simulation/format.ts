/**
 * Shared token amount formatting utilities.
 *
 * Used by both the event decoder (for display of decoded events) and
 * the slot decoder (for proven balance/allowance deltas). Keeping
 * this in one place prevents drift between the two formatters.
 */

/**
 * Format a token amount for human-readable display.
 *
 * - Adds thousands separators (e.g. "1,234,567")
 * - Shows up to 4 fractional digits, stripping trailing zeros
 * - Shows "<0.0001" for dust amounts that round to zero at 4 decimals
 * - Falls back to raw string when `decimals` is null (unknown token)
 *
 * @param raw      - Raw token amount as a bigint.
 * @param decimals - Token decimals, or null for unknown tokens.
 * @param symbol   - Token symbol for display, or null.
 */
export function formatTokenAmount(
  raw: bigint,
  decimals: number | null,
  symbol: string | null,
): string {
  if (decimals == null) {
    const str = raw.toString();
    return symbol ? `${str} ${symbol}` : str;
  }

  if (raw === 0n) return symbol ? `0 ${symbol}` : "0";

  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = (raw < 0n ? -raw : raw) % divisor;

  const wholeStr = whole.toLocaleString("en-US");
  const fractional = remainder
    .toString()
    .padStart(decimals, "0")
    .slice(0, 4)
    .replace(/0+$/, "");

  let numStr: string;
  if (fractional.length > 0) {
    numStr = `${wholeStr}.${fractional}`;
  } else if (whole === 0n && remainder > 0n) {
    numStr = "<0.0001";
  } else {
    numStr = wholeStr;
  }
  return symbol ? `${numStr} ${symbol}` : numStr;
}
