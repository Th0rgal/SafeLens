/**
 * Simulate a Safe `execTransaction` call using eth_call with state overrides.
 *
 * Technique: override the Safe's storage to plant a fake 1-of-1 owner,
 * sign the safeTxHash with the fake owner's known private key, then
 * execute `execTransaction` via eth_call. This reveals the transaction's
 * success/revert status and return data without needing real signatures.
 *
 * Optionally fetches event logs via `debug_traceCall` when the RPC node
 * supports it. Note: state diffs require `prestateTracer` with diffMode,
 * which is not yet implemented — the `stateDiffs` field in the schema
 * will be undefined for now.
 */

import {
  createPublicClient,
  http,
  pad,
  toHex,
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  CallExecutionError,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { computeSafeTxHash } from "../safe/hash";
import { CHAIN_BY_ID, DEFAULT_RPC_URLS, getExecutionCapability } from "../chains";
import {
  SENTINEL,
  SLOT_OWNER_COUNT,
  SLOT_THRESHOLD,
  SLOT_NONCE,
  GUARD_STORAGE_SLOT,
  FALLBACK_HANDLER_STORAGE_SLOT,
  ownerSlot,
  moduleSlot,
  slotToKey,
} from "../proof/safe-layout";
import type { Simulation, TrustClassification } from "../types";

// ── Fake owner for state-override simulation ──────────────────────

/**
 * A deterministic private key used only for state-override simulation.
 * This is Hardhat/Anvil account #0 — universally known and never used
 * to control real funds. It is safe here because we only call eth_call
 * (a read-only RPC method), never eth_sendRawTransaction.
 */
const SIMULATION_PRIVATE_KEY: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const SIMULATION_ACCOUNT = privateKeyToAccount(SIMULATION_PRIVATE_KEY);

// ── Safe execTransaction ABI ──────────────────────────────────────

const EXEC_TRANSACTION_ABI = parseAbi([
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)",
]);

// ── Options ───────────────────────────────────────────────────────

export interface FetchSimulationOptions {
  /** Custom RPC URL. Falls back to a public endpoint for the chain. */
  rpcUrl?: string;
  /** Block tag to simulate at. Defaults to "latest". */
  blockTag?: "latest" | "finalized" | "safe";
}

// ── Transaction shape (matches EvidencePackage.transaction) ───────

interface TransactionFields {
  to: string;
  value: string;
  data: string | null;
  operation: 0 | 1;
  nonce: number;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
}

// ── Main fetcher ──────────────────────────────────────────────────

/**
 * Simulate a Safe transaction via `eth_call` with state overrides.
 *
 * 1. Compute the safeTxHash using the transaction parameters.
 * 2. Sign it with the simulation account.
 * 3. Build state overrides: plant simulation account as sole 1-of-1 owner.
 * 4. Call `execTransaction` via `eth_call` with those overrides.
 * 5. Try `debug_traceCall` for accurate gasUsed + event logs.
 * 6. Return the simulation result (success, returnData, gasUsed, logs).
 */
export async function fetchSimulation(
  safeAddress: Address,
  chainId: number,
  transaction: TransactionFields,
  options: FetchSimulationOptions = {}
): Promise<Simulation> {
  const capability = getExecutionCapability(chainId);
  if (!capability) {
    throw new Error(`Unsupported chain ID for simulation: ${chainId}`);
  }
  if (!capability.supportsSimulation) {
    throw new Error(
      `Simulation is not supported on ${capability.chainName} (chain ${chainId}).`
    );
  }

  const chain = CHAIN_BY_ID[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID for simulation: ${chainId}`);
  }

  const rpcUrl = options.rpcUrl ?? DEFAULT_RPC_URLS[chainId];
  if (!rpcUrl) {
    throw new Error(
      `No RPC URL available for chain ${chainId}. Pass one via options.rpcUrl.`
    );
  }

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const blockTag = options.blockTag ?? "latest";
  const block = await client.getBlock({ blockTag });
  if (block.number == null) {
    throw new Error(
      "Block number is null (pending block). Use a finalized block tag."
    );
  }
  const blockNumber = Number(block.number);

  // ── Step 1: Compute safeTxHash ──────────────────────────────────

  const safeTxHash = computeSafeTxHash({
    safeAddress: safeAddress as Hex,
    chainId,
    to: transaction.to as Hex,
    value: BigInt(transaction.value),
    data: (transaction.data ?? "0x") as Hex,
    operation: transaction.operation,
    safeTxGas: BigInt(transaction.safeTxGas),
    baseGas: BigInt(transaction.baseGas),
    gasPrice: BigInt(transaction.gasPrice),
    gasToken: transaction.gasToken as Hex,
    refundReceiver: transaction.refundReceiver as Hex,
    nonce: transaction.nonce,
  });

  // ── Step 2: Sign with simulation account ────────────────────────
  // IMPORTANT: Use sign({hash}) — NOT signMessage — because Safe's
  // checkNSignatures calls ecrecover on the raw safeTxHash.
  // signMessage would apply an EIP-191 prefix, producing a different
  // hash and causing the signature to always be rejected (GS026).

  const signature = await SIMULATION_ACCOUNT.sign({
    hash: safeTxHash as Hex,
  });

  // ── Step 3: Build state overrides ───────────────────────────────

  const simulatorAddress = SIMULATION_ACCOUNT.address;

  const safeStateDiff: Array<{ slot: Hex; value: Hex }> = [
    // ownerCount = 1
    { slot: slotToKey(SLOT_OWNER_COUNT), value: pad("0x1" as Hex, { size: 32 }) },
    // threshold = 1
    { slot: slotToKey(SLOT_THRESHOLD), value: pad("0x1" as Hex, { size: 32 }) },
    // nonce = transaction nonce (so the hash matches)
    { slot: slotToKey(SLOT_NONCE), value: pad(toHex(transaction.nonce), { size: 32 }) },
    // owners[SENTINEL] = simulatorAddress
    { slot: ownerSlot(SENTINEL), value: pad(simulatorAddress, { size: 32 }) },
    // owners[simulatorAddress] = SENTINEL (close the linked list)
    { slot: ownerSlot(simulatorAddress), value: pad(SENTINEL, { size: 32 }) },
    // guard = address(0) (disable guard checks)
    { slot: GUARD_STORAGE_SLOT, value: pad("0x0" as Hex, { size: 32 }) },
    // fallbackHandler = address(0) (prevent fallback interference)
    { slot: FALLBACK_HANDLER_STORAGE_SLOT, value: pad("0x0" as Hex, { size: 32 }) },
    // modules[SENTINEL] = SENTINEL (close the modules linked list)
    { slot: moduleSlot(SENTINEL), value: pad(SENTINEL, { size: 32 }) },
  ];

  const viemStateOverride = [{ address: safeAddress, stateDiff: safeStateDiff }];

  // ── Step 4: Encode and call ─────────────────────────────────────

  const calldata = encodeFunctionData({
    abi: EXEC_TRANSACTION_ABI,
    functionName: "execTransaction",
    args: [
      transaction.to as Address,
      BigInt(transaction.value),
      (transaction.data ?? "0x") as Hex,
      transaction.operation,
      BigInt(transaction.safeTxGas),
      BigInt(transaction.baseGas),
      BigInt(transaction.gasPrice),
      transaction.gasToken as Address,
      transaction.refundReceiver as Address,
      signature,
    ],
  });

  let success = false;
  let returnData: Hex | null = null;
  let gasUsed = "0";

  try {
    const result = await client.call({
      to: safeAddress,
      data: calldata,
      blockNumber: block.number,
      stateOverride: viemStateOverride,
    });

    // Decode the bool return value from execTransaction
    if (result.data) {
      const decoded = decodeFunctionResult({
        abi: EXEC_TRANSACTION_ABI,
        functionName: "execTransaction",
        data: result.data,
      });
      success = decoded as boolean;
      returnData = result.data;
    }
  } catch (err) {
    // Distinguish execution errors (real reverts) from network/RPC errors.
    // CallExecutionError means the EVM executed the call and it reverted.
    // Anything else (HttpRequestError, TimeoutError, etc.) is a transport
    // failure that should propagate so callers can show a proper error.
    if (err instanceof CallExecutionError) {
      success = false;
      // Viem wraps reverts in CallExecutionError → RpcRequestError.
      // Revert data lives at err.cause.data, not err.data.
      returnData = extractRevertData(err);
    } else {
      throw err;
    }
  }

  // ── Step 5: Try debug_traceCall for logs + gasUsed (optional) ────
  // callTracer returns gasUsed on the top-level frame, which is accurate
  // even for reverted transactions (unlike estimateGas which throws).

  const traceResult = await tryTraceCall(
    client,
    safeAddress,
    calldata,
    block.number,
    viemStateOverride
  );

  // Prefer gas from the trace (accurate even on reverts)
  if (traceResult.gasUsed) {
    gasUsed = traceResult.gasUsed;
  } else if (success) {
    // Fallback: estimateGas works for successful transactions when
    // debug_traceCall is unavailable (common on public RPCs).
    // It throws on reverted txs, so we only try it when eth_call succeeded.
    try {
      const gas = await client.estimateGas({
        to: safeAddress,
        data: calldata,
        blockNumber: block.number,
        stateOverride: viemStateOverride,
      });
      gasUsed = gas.toString();
    } catch {
      // estimateGas may also fail if the node doesn't support stateOverride
    }
  }

  // ── Build result ────────────────────────────────────────────────

  const simulation: Simulation = {
    success,
    returnData,
    gasUsed,
    logs: traceResult.logs,
    blockNumber,
    trust: "rpc-sourced" as TrustClassification,
  };

  return simulation;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Ensure a hex string starts with 0x (some RPC nodes return bare hex). */
function normalizeHex(value: string): string {
  return value.startsWith("0x") ? value : `0x${value}`;
}

/**
 * Walk viem's error cause chain to extract revert data.
 * Viem wraps reverts as CallExecutionError → RpcRequestError.
 * The raw revert bytes live at the innermost cause's `.data` property.
 */
function extractRevertData(err: unknown): Hex | null {
  let current: unknown = err;
  for (let depth = 0; depth < 5; depth++) {
    if (current == null || typeof current !== "object") break;
    const obj = current as Record<string, unknown>;
    if (typeof obj.data === "string" && obj.data.startsWith("0x")) {
      return obj.data as Hex;
    }
    current = obj.cause;
  }
  return null;
}

// ── Optional: fetch logs + gasUsed via debug_traceCall ────────────

interface TraceResult {
  logs: Simulation["logs"];
  gasUsed: string | null;
}

async function tryTraceCall(
  client: ReturnType<typeof createPublicClient>,
  safeAddress: Address,
  calldata: Hex,
  blockNumber: bigint,
  stateOverride: Array<{
    address: Address;
    stateDiff: Array<{ slot: Hex; value: Hex }>;
  }>
): Promise<TraceResult> {
  try {
    // Build state override in the raw JSON-RPC format for debug_traceCall
    const stateOverrideObj: Record<
      string,
      { stateDiff: Record<string, string> }
    > = {};
    for (const override of stateOverride) {
      const diffs: Record<string, string> = {};
      for (const entry of override.stateDiff) {
        diffs[entry.slot] = entry.value;
      }
      stateOverrideObj[override.address] = { stateDiff: diffs };
    }

    const result = await client.request({
      method: "debug_traceCall" as "eth_call",
      params: [
        {
          to: safeAddress,
          data: calldata,
        },
        `0x${blockNumber.toString(16)}`,
        {
          tracer: "callTracer",
          tracerConfig: { withLog: true },
          stateOverrides: stateOverrideObj,
        },
      ] as unknown as [
        { to: Address; data: Hex },
        string,
        Record<string, unknown>,
      ],
    });

    // callTracer with withLog:true nests logs inside call frames.
    // Each frame has an optional `logs` array and an optional `calls`
    // array of child frames. We recursively collect all logs.
    // The top-level frame also has `gasUsed` (hex string).
    interface CallFrame {
      gasUsed?: string;
      logs?: Array<{ address: string; topics: string[]; data: string }>;
      calls?: CallFrame[];
    }

    function collectLogs(frame: CallFrame): Simulation["logs"] {
      const collected: Simulation["logs"] = [];
      if (frame.logs && Array.isArray(frame.logs)) {
        for (const log of frame.logs) {
          collected.push({
            address: normalizeHex(log.address) as Address,
            topics: log.topics.map((t) => normalizeHex(t)) as Hex[],
            data: normalizeHex(log.data ?? "0x") as Hex,
          });
        }
      }
      if (frame.calls && Array.isArray(frame.calls)) {
        for (const child of frame.calls) {
          collected.push(...collectLogs(child));
        }
      }
      return collected;
    }

    const frame = result as unknown as CallFrame;
    const logs = collectLogs(frame);

    // Extract gasUsed from the top-level call frame (hex string like "0x24fc1")
    let gasUsed: string | null = null;
    if (frame.gasUsed && typeof frame.gasUsed === "string") {
      gasUsed = parseInt(frame.gasUsed, 16).toString();
      if (isNaN(Number(gasUsed))) gasUsed = null;
    }

    return { logs, gasUsed };
  } catch {
    // debug_traceCall is not supported by all RPCs — silently fall back
    return { logs: [], gasUsed: null };
  }
}
