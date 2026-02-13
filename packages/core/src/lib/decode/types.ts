export interface DecodedParam {
  name: string;
  type: string;
  value: unknown;
}

export interface DecodedCall {
  method: string;
  parameters?: DecodedParam[];
}

export interface DecodedInnerTransaction {
  operation: number;
  to: string;
  value: string;
  data: string;
  dataDecoded?: DecodedCall | null;
}

export interface CallStep {
  index: number;
  to: string;
  value: string;
  operation: number;
  method: string | null;
  params: DecodedParam[];
  rawData: string;
}
