import type { CallStep, DecodedParam } from "./types";

function passParams(params?: DecodedParam[]): DecodedParam[] {
  if (!params || params.length === 0) return [];
  return params.map((p) => ({ name: p.name, type: p.type, value: p.value }));
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
      params: passParams(
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
      params: passParams(decoded.parameters as DecodedParam[] | undefined),
      rawData: txData ?? "",
    },
  ];
}
