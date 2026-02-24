/**
 * Simulate a Safe `execTransaction` call using eth_call with state overrides.
 *
 * Technique: override the Safe's storage to plant a fake 1-of-1 owner,
 * sign the safeTxHash with the fake owner's known private key, then
 * execute `execTransaction` via eth_call. This reveals the transaction's
 * success/revert status and return data without needing real signatures.
 *
 * Optionally fetches event logs via `debug_traceCall` when the RPC node
 * supports it. When `prestateTracer` with `diffMode` is available,
 * storage-level state diffs are extracted and attached to the simulation.
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
import type {
  Simulation,
  StateDiffEntry,
  NativeTransfer,
  SimulationWitness,
  TrustClassification,
} from "../types";
import { computeSimulationDigest } from "./witness-verifier";

// ── Fake owner for state-override simulation ──────────────────────

/**
 * A deterministic private key used only for state-override simulation.
 * This is Hardhat/Anvil account #0, universally known and never used
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
  /** Optional explicit block number to pin simulation/witness context. */
  blockNumber?: number;
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

function buildSafeStateDiff(
  nonce: number,
  simulatorAddress: Address
): Array<{ slot: Hex; value: Hex }> {
  return [
    // ownerCount = 1
    { slot: slotToKey(SLOT_OWNER_COUNT), value: pad("0x1" as Hex, { size: 32 }) },
    // threshold = 1
    { slot: slotToKey(SLOT_THRESHOLD), value: pad("0x1" as Hex, { size: 32 }) },
    // nonce = transaction nonce (so the hash matches)
    { slot: slotToKey(SLOT_NONCE), value: pad(toHex(nonce), { size: 32 }) },
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

  const block = options.blockNumber !== undefined
    ? await client.getBlock({ blockNumber: BigInt(options.blockNumber) })
    : await client.getBlock({ blockTag: options.blockTag ?? "latest" });
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
  // IMPORTANT: Use sign({hash}), NOT signMessage, because Safe's
  // checkNSignatures calls ecrecover on the raw safeTxHash.
  // signMessage would apply an EIP-191 prefix, producing a different
  // hash and causing the signature to always be rejected (GS026).

  const signature = await SIMULATION_ACCOUNT.sign({
    hash: safeTxHash as Hex,
  });

  // ── Step 3: Build state overrides ───────────────────────────────

  const simulatorAddress = SIMULATION_ACCOUNT.address;

  const safeStateDiff = buildSafeStateDiff(transaction.nonce, simulatorAddress);

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

  // ── Step 6: Try prestateTracer for storage-level state diffs ────
  // Only attempt when debug_traceCall is available (confirmed by step 5).

  let stateDiffs: StateDiffEntry[] | undefined;
  if (traceResult.available) {
    stateDiffs = await tryCollectStateDiffs(
      client,
      safeAddress,
      calldata,
      block.number,
      viemStateOverride
    );
  }

  // ── Build result ────────────────────────────────────────────────

  const { nativeTransfers } = traceResult;

  const simulation: Simulation = {
    success,
    returnData,
    gasUsed,
    logs: traceResult.logs,
    nativeTransfers: nativeTransfers.length > 0 ? nativeTransfers : undefined,
    stateDiffs: stateDiffs && stateDiffs.length > 0 ? stateDiffs : undefined,
    blockNumber,
    blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    trust: "rpc-sourced" as TrustClassification,
    traceAvailable: traceResult.available,
  };

  return simulation;
}

export async function fetchSimulationWitness(
  safeAddress: Address,
  chainId: number,
  transaction: TransactionFields,
  simulation: Simulation,
  options: FetchSimulationOptions = {}
): Promise<SimulationWitness> {
  const capability = getExecutionCapability(chainId);
  if (!capability) {
    throw new Error(`Unsupported chain ID for simulation witness: ${chainId}`);
  }
  if (!capability.supportsSimulation) {
    throw new Error(
      `Simulation witness is not supported on ${capability.chainName} (chain ${chainId}).`
    );
  }

  const chain = CHAIN_BY_ID[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID for simulation witness: ${chainId}`);
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

  const blockNumber = BigInt(simulation.blockNumber);
  const block = await client.getBlock({ blockNumber });
  if (block.number == null) {
    throw new Error("Simulation witness block number is null.");
  }

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
  const signature = await SIMULATION_ACCOUNT.sign({
    hash: safeTxHash as Hex,
  });
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

  const stateDiff = buildSafeStateDiff(transaction.nonce, SIMULATION_ACCOUNT.address);
  const storageKeys = stateDiff.map((entry) => entry.slot);
  const proof = await client.getProof({
    address: safeAddress,
    storageKeys,
    blockNumber,
  });
  const replayAccounts = await tryCollectReplayAccounts(
    client,
    safeAddress,
    calldata,
    blockNumber,
    [
      {
        address: safeAddress,
        stateDiff,
      },
    ],
    // Prestate traces often omit untouched EOAs (recipient/caller). The only
    // replay-critical account we must always capture is the Safe itself.
    [safeAddress]
  );

  const fallbackReplayAccounts = await tryCollectSimpleTransferReplayAccounts(
    client,
    safeAddress,
    transaction,
    blockNumber
  );
  const resolvedReplayAccounts = replayAccounts ?? fallbackReplayAccounts;

  return {
    chainId,
    safeAddress,
    blockNumber: Number(block.number),
    stateRoot: block.stateRoot,
    safeAccountProof: {
      address: proof.address,
      balance: proof.balance.toString(),
      codeHash: proof.codeHash,
      nonce: Number(proof.nonce),
      storageHash: proof.storageHash,
      accountProof: proof.accountProof,
      storageProof: proof.storageProof.map((sp) => ({
        key: sp.key,
        value: pad(toHex(sp.value), { size: 32 }),
        proof: sp.proof,
      })),
    },
    overriddenSlots: stateDiff.map((entry) => ({
      key: entry.slot,
      value: entry.value,
    })),
    simulationDigest: computeSimulationDigest(simulation),
    replayBlock: {
      timestamp: block.timestamp.toString(),
      gasLimit: block.gasLimit.toString(),
      baseFeePerGas: (block.baseFeePerGas ?? 0n).toString(),
      beneficiary: block.miner ?? "0x0000000000000000000000000000000000000000",
      prevRandao: block.mixHash ?? undefined,
      difficulty: block.difficulty.toString(),
    },
    replayAccounts: resolvedReplayAccounts,
    replayCaller: SIMULATION_ACCOUNT.address,
    replayGasLimit: normalizeReplayGasLimit(transaction.safeTxGas),
  };
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

function normalizeReplayGasLimit(safeTxGas: string): number {
  try {
    const value = BigInt(safeTxGas);
    if (value <= 0n) {
      return 3_000_000;
    }
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number.MAX_SAFE_INTEGER;
    }
    return Number(value);
  } catch {
    return 3_000_000;
  }
}

interface PrestateAccount {
  balance?: string;
  nonce?: string;
  code?: string;
  storage?: Record<string, string>;
}

type PrestateTrace = Record<string, PrestateAccount>;

function isAddressLike(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function normalizeWordHex(value: string): Hex {
  return pad(normalizeHex(value) as Hex, { size: 32 }) as Hex;
}

function parseNonce(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const normalized = normalizeHex(value);
  const parsed = BigInt(normalized);
  if (parsed <= 0n) {
    return 0;
  }
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Number(parsed);
}

function traceToReplayAccounts(
  trace: PrestateTrace,
  requiredAddresses: Address[]
): SimulationWitness["replayAccounts"] {
  const byAddress = new Map<string, NonNullable<SimulationWitness["replayAccounts"]>[number]>();
  for (const [address, account] of Object.entries(trace)) {
    if (!isAddressLike(address)) {
      continue;
    }

    const storageEntries = Object.entries(account.storage ?? {});
    const storage = Object.fromEntries(
      storageEntries.map(([slot, value]) => [normalizeWordHex(slot), normalizeWordHex(value)])
    );

    byAddress.set(address.toLowerCase(), {
      address: normalizeHex(address).toLowerCase() as Address,
      balance: account.balance ? normalizeHex(account.balance) : "0x0",
      nonce: parseNonce(account.nonce),
      code: account.code ? normalizeHex(account.code) : "0x",
      storage,
    });
  }

  const required = requiredAddresses.map((value) => value.toLowerCase());
  const hasRequiredCoverage = required.every((address) => byAddress.has(address));
  if (!hasRequiredCoverage) {
    return undefined;
  }

  return Array.from(byAddress.values());
}

// ── Optional: fetch logs + gasUsed via debug_traceCall ────────────

interface TraceResult {
  logs: Simulation["logs"];
  nativeTransfers: NativeTransfer[];
  gasUsed: string | null;
  available: boolean;
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

    const callTracerConfig = {
      tracer: "callTracer",
      tracerConfig: { withLog: true },
    } as const;
    const paramsBase = [
      {
        to: safeAddress,
        data: calldata,
      },
      `0x${blockNumber.toString(16)}`,
    ] as const;
    let result: unknown;
    try {
      // Gnosis-style RPCs expect `stateOverrides` (plural) for callTracer.
      result = await client.request({
        method: "debug_traceCall" as "eth_call",
        params: [
          ...paramsBase,
          {
            ...callTracerConfig,
            stateOverrides: stateOverrideObj,
          },
        ] as unknown as [
          { to: Address; data: Hex },
          string,
          Record<string, unknown>,
        ],
      });
    } catch {
      // Fallback for clients that expect `stateOverride` (singular).
      result = await client.request({
        method: "debug_traceCall" as "eth_call",
        params: [
          ...paramsBase,
          {
            ...callTracerConfig,
            stateOverride: stateOverrideObj,
          },
        ] as unknown as [
          { to: Address; data: Hex },
          string,
          Record<string, unknown>,
        ],
      });
    }

    // callTracer with withLog:true nests logs inside call frames.
    // Each frame has an optional `logs` array and an optional `calls`
    // array of child frames. We recursively collect all logs.
    // The top-level frame also has `gasUsed` (hex string).
    //
    // We also collect native value transfers: any CALL/CREATE frame
    // with a non-zero `value` represents an ETH movement.
    interface CallFrame {
      type?: string;
      from?: string;
      to?: string;
      value?: string;
      gasUsed?: string;
      error?: string;
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

    function collectNativeTransfers(frame: CallFrame): NativeTransfer[] {
      const transfers: NativeTransfer[] = [];
      // Value-carrying call types (STATICCALL and DELEGATECALL cannot carry value)
      const valueTypes = new Set(["CALL", "CREATE", "CREATE2"]);
      if (
        frame.from && frame.to && frame.value &&
        !frame.error &&
        valueTypes.has((frame.type ?? "").toUpperCase())
      ) {
        const valueBn = BigInt(frame.value);
        if (valueBn > 0n) {
          transfers.push({
            from: normalizeHex(frame.from).toLowerCase() as Address,
            to: normalizeHex(frame.to).toLowerCase() as Address,
            value: valueBn.toString(),
          });
        }
      }
      if (frame.calls && Array.isArray(frame.calls)) {
        for (const child of frame.calls) {
          transfers.push(...collectNativeTransfers(child));
        }
      }
      return transfers;
    }

    const frame = result as unknown as CallFrame;
    const logs = collectLogs(frame);
    const nativeTransfers = collectNativeTransfers(frame);

    // Extract gasUsed from the top-level call frame (hex string like "0x24fc1")
    let gasUsed: string | null = null;
    if (frame.gasUsed && typeof frame.gasUsed === "string") {
      gasUsed = parseInt(frame.gasUsed, 16).toString();
      if (isNaN(Number(gasUsed))) gasUsed = null;
    }

    return { logs, nativeTransfers, gasUsed, available: true };
  } catch {
    // debug_traceCall is not supported by all RPCs, silently fall back
    return { logs: [], nativeTransfers: [], gasUsed: null, available: false };
  }
}

// ── Optional: extract storage-level state diffs via prestateTracer ──

async function tryCollectStateDiffs(
  client: ReturnType<typeof createPublicClient>,
  safeAddress: Address,
  calldata: Hex,
  blockNumber: bigint,
  stateOverride: Array<{
    address: Address;
    stateDiff: Array<{ slot: Hex; value: Hex }>;
  }>
): Promise<StateDiffEntry[] | undefined> {
  try {
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

    const prestateConfig = {
      tracer: "prestateTracer",
      tracerConfig: { diffMode: true },
    } as const;
    const paramsBase = [
      {
        to: safeAddress,
        data: calldata,
      },
      `0x${blockNumber.toString(16)}`,
    ] as const;

    let result: unknown;
    try {
      // Gnosis-style RPCs expect `stateOverrides` (plural) — try that first,
      // matching the retry order in tryTraceCall.
      result = await client.request({
        method: "debug_traceCall" as "eth_call",
        params: [
          ...paramsBase,
          {
            ...prestateConfig,
            stateOverrides: stateOverrideObj,
          },
        ] as unknown as [
          { to: Address; data: Hex },
          string,
          Record<string, unknown>,
        ],
      });
    } catch {
      // Fallback for clients that expect `stateOverride` (singular).
      result = await client.request({
        method: "debug_traceCall" as "eth_call",
        params: [
          ...paramsBase,
          {
            ...prestateConfig,
            stateOverride: stateOverrideObj,
          },
        ] as unknown as [
          { to: Address; data: Hex },
          string,
          Record<string, unknown>,
        ],
      });
    }

    if (!result || typeof result !== "object") {
      return undefined;
    }

    const rawRecord = result as Record<string, unknown>;
    const pre = rawRecord.pre as PrestateTrace | undefined;
    const post = rawRecord.post as PrestateTrace | undefined;
    if (!pre || !post) {
      return undefined;
    }

    return extractStateDiffs(pre, post);
  } catch {
    // prestateTracer is not supported by all RPCs, silently fall back
    return undefined;
  }
}

function extractStateDiffs(
  pre: PrestateTrace,
  post: PrestateTrace
): StateDiffEntry[] {
  const diffs: StateDiffEntry[] = [];
  const ZERO = "0x" + "00".repeat(32);

  // Collect all addresses that appear in either pre or post
  const addresses = new Set([
    ...Object.keys(pre),
    ...Object.keys(post),
  ]);

  for (const address of addresses) {
    if (!isAddressLike(address)) continue;
    const normalizedAddr = normalizeHex(address).toLowerCase();

    const preStorage = pre[address]?.storage ?? {};
    const postStorage = post[address]?.storage ?? {};

    // Collect all slots that appear in either pre or post for this address
    const slots = new Set([
      ...Object.keys(preStorage),
      ...Object.keys(postStorage),
    ]);

    for (const slot of slots) {
      const before = normalizeWordHex(preStorage[slot] ?? ZERO);
      const after = normalizeWordHex(postStorage[slot] ?? ZERO);
      if (before !== after) {
        diffs.push({
          address: normalizedAddr as Address,
          key: normalizeWordHex(slot) as `0x${string}`,
          before: before as `0x${string}`,
          after: after as `0x${string}`,
        });
      }
    }
  }

  return diffs;
}

async function tryCollectReplayAccounts(
  client: ReturnType<typeof createPublicClient>,
  safeAddress: Address,
  calldata: Hex,
  blockNumber: bigint,
  stateOverride: Array<{
    address: Address;
    stateDiff: Array<{ slot: Hex; value: Hex }>;
  }>,
  requiredAddresses: Address[]
): Promise<SimulationWitness["replayAccounts"]> {
  try {
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

    const prestateConfig = {
      tracer: "prestateTracer",
      tracerConfig: { diffMode: true },
    } as const;
    const paramsBase = [
      {
        to: safeAddress,
        data: calldata,
      },
      `0x${blockNumber.toString(16)}`,
    ] as const;
    let result: unknown;
    try {
      result = await client.request({
        method: "debug_traceCall" as "eth_call",
        params: [
          ...paramsBase,
          {
            ...prestateConfig,
            stateOverride: stateOverrideObj,
          },
        ] as unknown as [
          { to: Address; data: Hex },
          string,
          Record<string, unknown>,
        ],
      });
    } catch {
      result = await client.request({
        method: "debug_traceCall" as "eth_call",
        params: [
          ...paramsBase,
          {
            ...prestateConfig,
            stateOverrides: stateOverrideObj,
          },
        ] as unknown as [
          { to: Address; data: Hex },
          string,
          Record<string, unknown>,
        ],
      });
    }

    const raw = result as unknown;
    if (!raw || typeof raw !== "object") {
      return undefined;
    }

    const rawRecord = raw as Record<string, unknown>;
    const pre = rawRecord.pre;
    const trace =
      pre && typeof pre === "object"
        ? (pre as PrestateTrace)
        : (raw as PrestateTrace);

    return traceToReplayAccounts(trace, requiredAddresses);
  } catch {
    return undefined;
  }
}

async function tryCollectSimpleTransferReplayAccounts(
  client: ReturnType<typeof createPublicClient>,
  safeAddress: Address,
  transaction: TransactionFields,
  blockNumber: bigint
): Promise<SimulationWitness["replayAccounts"]> {
  // Fallback only for plain native transfers (CALL with empty calldata) to an EOA.
  // Contract calls may require rich storage snapshots from prestateTracer.
  const isCall = transaction.operation === 0;
  const dataHex = (transaction.data ?? "0x").toLowerCase();
  const isEmptyCalldata = dataHex === "0x";
  if (!isCall || !isEmptyCalldata) {
    return undefined;
  }

  const recipient = transaction.to as Address;
  try {
    const recipientCode = await client.getCode({ address: recipient, blockNumber });
    if (recipientCode && recipientCode !== "0x") {
      return undefined;
    }

    const safeOverrideStorage = Object.fromEntries(
      buildSafeStateDiff(transaction.nonce, SIMULATION_ACCOUNT.address).map((entry) => [
        entry.slot,
        entry.value,
      ])
    );
    const addresses: Address[] = [safeAddress, recipient, SIMULATION_ACCOUNT.address];
    const snapshots = await Promise.all(
      addresses.map(async (address) => {
        const [balance, nonce, code] = await Promise.all([
          client.getBalance({ address, blockNumber }),
          client.getTransactionCount({ address, blockNumber }),
          client.getCode({ address, blockNumber }),
        ]);

        return {
          address: address.toLowerCase() as Address,
          balance: normalizeHex(toHex(balance)),
          nonce,
          code: code && code !== "0x" ? normalizeHex(code) : "0x",
          storage:
            address.toLowerCase() === safeAddress.toLowerCase()
              ? safeOverrideStorage
              : {},
        };
      })
    );

    return snapshots;
  } catch {
    return undefined;
  }
}

export const __internal = {
  traceToReplayAccounts,
  normalizeReplayGasLimit,
  extractStateDiffs,
};
