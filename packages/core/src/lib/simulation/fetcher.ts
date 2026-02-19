/**
 * Simulate a Safe `execTransaction` call using eth_call with state overrides.
 *
 * Technique: override the Safe's storage to plant a fake 1-of-1 owner,
 * sign the safeTxHash with the fake owner's known private key, then
 * execute `execTransaction` via eth_call. This reveals the transaction's
 * success/revert status and return data without needing real signatures.
 *
 * Optionally fetches logs and state diffs via `debug_traceCall` when the
 * RPC node supports it.
 */

import {
  createPublicClient,
  http,
  pad,
  toHex,
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  type Address,
  type Hex,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  mainnet,
  sepolia,
  polygon,
  arbitrum,
  optimism,
  gnosis,
  base,
} from "viem/chains";
import { computeSafeTxHash } from "../safe/hash";
import {
  SENTINEL,
  SLOT_OWNER_COUNT,
  SLOT_THRESHOLD,
  SLOT_NONCE,
  GUARD_STORAGE_SLOT,
  ownerSlot,
  slotToKey,
} from "../proof/safe-layout";
import type { Simulation, TrustClassification } from "../types";

// ── Chain lookup (shared with proof fetcher) ──────────────────────

const CHAIN_BY_ID: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  100: gnosis,
  8453: base,
};

const DEFAULT_RPC_URLS: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  137: "https://polygon-bor-rpc.publicnode.com",
  42161: "https://arbitrum-one-rpc.publicnode.com",
  10: "https://optimism-rpc.publicnode.com",
  100: "https://gnosis-rpc.publicnode.com",
  8453: "https://base-rpc.publicnode.com",
};

// ── Fake owner for state-override simulation ──────────────────────

/**
 * A deterministic private key used only for state-override simulation.
 * The Safe's storage is overridden so this address is the sole 1-of-1
 * owner. This key never controls real funds.
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
 * 5. Return the simulation result (success, returnData, gasUsed, logs).
 */
export async function fetchSimulation(
  safeAddress: Address,
  chainId: number,
  transaction: TransactionFields,
  options: FetchSimulationOptions = {}
): Promise<Simulation> {
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

  const signature = await SIMULATION_ACCOUNT.signMessage({
    message: { raw: safeTxHash as Hex },
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
    // If the call reverts, that's the simulation result (not an error)
    success = false;
    if (err instanceof Error && "data" in err) {
      returnData = (err as { data?: Hex }).data ?? null;
    }
  }

  // ── Step 5: Try to get gas estimate ─────────────────────────────

  try {
    const gas = await client.estimateGas({
      to: safeAddress,
      data: calldata,
      blockNumber: block.number,
      stateOverride: viemStateOverride,
    });
    gasUsed = gas.toString();
  } catch {
    // Gas estimation may fail if the call reverts — that's fine
    gasUsed = "0";
  }

  // ── Step 6: Try debug_traceCall for logs (optional) ─────────────

  const logs = await tryFetchLogs(
    client,
    safeAddress,
    calldata,
    block.number,
    viemStateOverride
  );

  // ── Build result ────────────────────────────────────────────────

  const simulation: Simulation = {
    success,
    returnData,
    gasUsed,
    logs,
    blockNumber,
    trust: "rpc-sourced" as TrustClassification,
  };

  return simulation;
}

// ── Optional: fetch logs via debug_traceCall ──────────────────────

async function tryFetchLogs(
  client: ReturnType<typeof createPublicClient>,
  safeAddress: Address,
  calldata: Hex,
  blockNumber: bigint,
  stateOverride: Array<{
    address: Address;
    stateDiff: Array<{ slot: Hex; value: Hex }>;
  }>
): Promise<Simulation["logs"]> {
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

    // Extract logs from the trace result
    const trace = result as unknown as {
      logs?: Array<{
        address: string;
        topics: string[];
        data: string;
      }>;
    };

    if (trace.logs && Array.isArray(trace.logs)) {
      return trace.logs.map((log) => ({
        address: log.address as Address,
        topics: log.topics as Hex[],
        data: (log.data ?? "0x") as Hex,
      }));
    }

    return [];
  } catch {
    // debug_traceCall is not supported by all RPCs — silently fall back
    return [];
  }
}
