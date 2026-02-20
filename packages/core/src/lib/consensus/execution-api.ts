import { getNetworkCapability } from "../networks/capabilities";
import type { ConsensusMode, ConsensusProof } from "../types";

type ExecutionConsensusMode = Extract<ConsensusMode, "opstack" | "linea">;

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: number | string | null;
  result: T;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: number | string | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

interface ExecutionBlockHeader {
  number: `0x${string}`;
  hash: `0x${string}`;
  parentHash: `0x${string}`;
  stateRoot: `0x${string}`;
  timestamp: `0x${string}`;
}

export interface FetchExecutionConsensusProofOptions {
  rpcUrl?: string;
  blockTag?: "latest" | "finalized" | "safe";
}

interface EnvelopePayload {
  schema: "execution-block-header-v1";
  chainId: number;
  consensusMode: ExecutionConsensusMode;
  blockTag: "latest" | "finalized" | "safe";
  block: {
    number: string;
    hash: `0x${string}`;
    parentHash: `0x${string}`;
    stateRoot: `0x${string}`;
    timestamp: string;
  };
}

const HEX_32_BYTE_RE = /^0x[0-9a-fA-F]{64}$/;

function resolveEnvelopeNetwork(chainId: number, fallbackNetwork: string): string {
  // Keep OP Mainnet envelope metadata aligned with desktop verifier contract.
  // "oeth" is a Safe URL prefix, while consensus envelope metadata uses
  // the canonical network identifier "optimism".
  if (chainId === 10) {
    return "optimism";
  }

  return fallbackNetwork;
}

function parseHexQuantity(value: unknown, fieldName: string): number {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`Invalid hex quantity for ${fieldName}: ${value}`);
  }

  const parsed = Number.parseInt(value.slice(2), 16);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Hex quantity for ${fieldName} is not a safe integer: ${value}`);
  }

  return parsed;
}

function parseHex32(value: unknown, fieldName: string): `0x${string}` {
  if (typeof value !== "string" || !HEX_32_BYTE_RE.test(value)) {
    throw new Error(`Invalid 32-byte hex value for ${fieldName}: ${value}`);
  }
  return value as `0x${string}`;
}

async function requestJsonRpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[]
): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as JsonRpcResponse<T>;
  if ("error" in payload) {
    throw new Error(
      `RPC error ${payload.error.code} for ${method}: ${payload.error.message}`
    );
  }

  if (payload.result == null) {
    throw new Error(`RPC result for ${method} was null.`);
  }

  return payload.result;
}

export async function fetchExecutionConsensusProof(
  chainId: number,
  consensusMode: ExecutionConsensusMode,
  options: FetchExecutionConsensusProofOptions = {}
): Promise<ConsensusProof> {
  const capability = getNetworkCapability(chainId);
  const rpcUrl = options.rpcUrl ?? capability?.defaultRpcUrl;
  if (!rpcUrl) {
    throw new Error(
      `No RPC URL available for chain ${chainId}. Pass one via options.rpcUrl.`
    );
  }

  const blockTag = options.blockTag ?? "finalized";
  if (blockTag !== "finalized") {
    throw new Error(
      `Execution consensus envelopes require blockTag='finalized'; received '${blockTag}'.`
    );
  }

  const rpcChainIdHex = await requestJsonRpc<string>(rpcUrl, "eth_chainId", []);
  const rpcChainId = parseHexQuantity(rpcChainIdHex, "eth_chainId");
  if (rpcChainId !== chainId) {
    throw new Error(
      `RPC eth_chainId mismatch: expected ${chainId}, received ${rpcChainId}.`
    );
  }

  const block = await requestJsonRpc<ExecutionBlockHeader>(rpcUrl, "eth_getBlockByNumber", [
    blockTag,
    false,
  ]);

  const blockNumber = parseHexQuantity(block.number, "block.number");
  const timestamp = parseHexQuantity(block.timestamp, "block.timestamp");
  const blockHash = parseHex32(block.hash, "block.hash");
  const parentHash = parseHex32(block.parentHash, "block.parentHash");
  const stateRoot = parseHex32(block.stateRoot, "block.stateRoot");

  const envelopePayload: EnvelopePayload = {
    schema: "execution-block-header-v1",
    chainId,
    consensusMode,
    blockTag,
    block: {
      number: block.number,
      hash: blockHash,
      parentHash,
      stateRoot,
      timestamp: new Date(timestamp * 1000).toISOString(),
    },
  };

  return {
    consensusMode,
    network: resolveEnvelopeNetwork(
      chainId,
      capability?.chainPrefix ?? String(chainId)
    ),
    stateRoot,
    blockNumber,
    proofPayload: JSON.stringify(envelopePayload),
  };
}
