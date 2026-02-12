import type { CallStep, DecodedParam, ParamSummary } from "./types";

function isAddress(type: string): boolean {
  return type === "address";
}

function formatParamValue(param: DecodedParam): string {
  const { type, value } = param;

  // Address — keep full for AddressDisplay to resolve
  if (isAddress(type)) {
    return typeof value === "string" ? value : String(value);
  }

  // Tuple types — show as [type]
  if (type.startsWith("(")) {
    return `[${type}]`;
  }

  // Bytes / hex — truncate
  if (typeof value === "string" && value.startsWith("0x")) {
    if (value.length > 20) {
      return `${value.slice(0, 10)}…${value.slice(-6)}`;
    }
    return value;
  }

  // Large numbers — truncate
  const str = String(value);
  if (/^\d+$/.test(str) && str.length > 12) {
    return `${str.slice(0, 5)}…`;
  }

  // Boolean / short strings
  return str;
}

function summarizeParams(params?: DecodedParam[]): ParamSummary[] {
  if (!params || params.length === 0) return [];
  return params.map((p) => ({
    name: p.name,
    type: p.type,
    displayValue: formatParamValue(p),
  }));
}

export function normalizeCallSteps(
  dataDecoded: unknown,
  txTo: string,
  txValue: string,
  txOperation: number,
  txData: string | null
): CallStep[] {
  if (!dataDecoded || typeof dataDecoded !== "object") return [];

  const decoded = dataDecoded as {
    method?: string;
    parameters?: Array<{
      name?: string;
      type?: string;
      value?: unknown;
      valueDecoded?: Array<{
        operation?: number;
        to?: string;
        value?: string;
        data?: string;
        dataDecoded?: {
          method?: string;
          parameters?: Array<{ name: string; type: string; value: unknown }>;
        } | null;
      }>;
    }>;
  };

  if (!decoded.method) return [];

  // multiSend — extract inner transactions from valueDecoded
  if (decoded.method === "multiSend") {
    const txsParam = decoded.parameters?.find((p) => p.name === "transactions");
    const inner = txsParam?.valueDecoded;
    if (!inner || inner.length === 0) return [];

    return inner.map((tx, i) => ({
      index: i,
      to: tx.to ?? txTo,
      value: tx.value ?? "0",
      operation: tx.operation ?? 0,
      method: tx.dataDecoded?.method ?? null,
      params: summarizeParams(
        tx.dataDecoded?.parameters as DecodedParam[] | undefined
      ),
      rawData: tx.data ?? "",
    }));
  }

  // Single call
  return [
    {
      index: 0,
      to: txTo,
      value: txValue,
      operation: txOperation,
      method: decoded.method,
      params: summarizeParams(decoded.parameters as DecodedParam[] | undefined),
      rawData: txData ?? "",
    },
  ];
}
