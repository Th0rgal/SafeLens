/**
 * Fetch on-chain policy proof (eth_getProof) for a Safe multisig.
 *
 * Walks the owner/module sentinel linked lists to discover dynamic
 * storage keys, then fetches a single eth_getProof call with all
 * required storage slots.
 */

import {
  createPublicClient,
  http,
  pad,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import type { OnchainPolicyProof, TrustClassification } from "../types";
import { CHAIN_BY_ID, DEFAULT_RPC_URLS } from "../chains";
import {
  SENTINEL,
  SLOT_SINGLETON,
  SLOT_OWNER_COUNT,
  SLOT_THRESHOLD,
  SLOT_NONCE,
  GUARD_STORAGE_SLOT,
  FALLBACK_HANDLER_STORAGE_SLOT,
  ownerSlot,
  moduleSlot,
  slotToKey,
} from "./safe-layout";

// ── Helpers ──────────────────────────────────────────────────────

/** Extract an address from a 32-byte storage value (right-aligned). */
function storageToAddress(value: Hex): Address {
  const raw = value.replace(/^0x/, "").padStart(64, "0");
  return `0x${raw.slice(24)}` as Address;
}

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

// ── Main fetcher ─────────────────────────────────────────────────

export interface FetchOnchainProofOptions {
  /** Custom RPC URL. Falls back to a public endpoint for the chain. */
  rpcUrl?: string;
  /** Block tag or number. Defaults to "latest". */
  blockTag?: "latest" | "finalized" | "safe";
}

/**
 * Fetch an `OnchainPolicyProof` for a Safe multisig.
 *
 * 1. Reads fixed storage slots to learn ownerCount / threshold / etc.
 * 2. Walks the owners and modules sentinel linked lists.
 * 3. Fetches `eth_getProof` with all discovered storage keys.
 * 4. Returns a fully-populated `OnchainPolicyProof` ready for
 *    inclusion in an evidence package.
 */
export async function fetchOnchainPolicyProof(
  safeAddress: Address,
  chainId: number,
  options: FetchOnchainProofOptions = {}
): Promise<OnchainPolicyProof> {
  const chain = CHAIN_BY_ID[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID for proof fetching: ${chainId}`);
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

  // Get the block to pin the state root
  const block = await client.getBlock({ blockTag });
  if (block.number == null) {
    throw new Error("Block number is null (pending block). Use a finalized block tag.");
  }
  const blockNumber = Number(block.number);
  const stateRoot = block.stateRoot;

  // Read fixed storage values to discover linked list chains
  const [
    ownerCountRaw,
    thresholdRaw,
    nonceRaw,
    singletonRaw,
    guardRaw,
    fallbackRaw,
  ] = await Promise.all([
    readStorage(client, safeAddress, slotToKey(SLOT_OWNER_COUNT), block.number),
    readStorage(client, safeAddress, slotToKey(SLOT_THRESHOLD), block.number),
    readStorage(client, safeAddress, slotToKey(SLOT_NONCE), block.number),
    readStorage(client, safeAddress, slotToKey(SLOT_SINGLETON), block.number),
    readStorage(client, safeAddress, GUARD_STORAGE_SLOT, block.number),
    readStorage(
      client,
      safeAddress,
      FALLBACK_HANDLER_STORAGE_SLOT,
      block.number
    ),
  ]);

  const ownerCount = Number(BigInt(ownerCountRaw || "0x0"));
  const threshold = Number(BigInt(thresholdRaw || "0x0"));
  const nonce = Number(BigInt(nonceRaw || "0x0"));
  const singleton = storageToAddress(singletonRaw || ("0x0" as Hex));
  const guard = storageToAddress(guardRaw || ("0x0" as Hex));
  const fallbackHandler = storageToAddress(fallbackRaw || ("0x0" as Hex));

  // Walk the owners linked list: SENTINEL -> owner1 -> ... -> SENTINEL
  const owners = await walkLinkedList(
    client,
    safeAddress,
    ownerSlot,
    ownerCount,
    block.number
  );

  // Walk the modules linked list
  const modules = await walkLinkedList(
    client,
    safeAddress,
    moduleSlot,
    50, // max modules (safety limit)
    block.number
  );

  // Build the complete list of storage keys for eth_getProof
  const storageKeys: Hex[] = [
    slotToKey(SLOT_SINGLETON),
    slotToKey(SLOT_OWNER_COUNT),
    slotToKey(SLOT_THRESHOLD),
    slotToKey(SLOT_NONCE),
    GUARD_STORAGE_SLOT,
    FALLBACK_HANDLER_STORAGE_SLOT,
    ownerSlot(SENTINEL),
    moduleSlot(SENTINEL),
    ...owners.map((o) => ownerSlot(o)),
    ...modules.map((m) => moduleSlot(m)),
  ];

  // Fetch the full proof
  const proof = await client.getProof({
    address: safeAddress,
    storageKeys,
    blockNumber: block.number,
  });

  // Build the result
  const onchainPolicyProof: OnchainPolicyProof = {
    blockNumber,
    stateRoot,
    accountProof: {
      address: proof.address,
      balance: proof.balance.toString(),
      codeHash: proof.codeHash,
      nonce: Number(proof.nonce),
      storageHash: proof.storageHash,
      accountProof: proof.accountProof,
      storageProof: proof.storageProof.map((sp) => ({
        key: sp.key,
        value: pad(
          `0x${sp.value.toString(16)}` as Hex,
          { size: 32 }
        ),
        proof: sp.proof,
      })),
    },
    decodedPolicy: {
      owners,
      threshold,
      nonce,
      modules,
      guard,
      fallbackHandler,
      singleton,
    },
    trust: "rpc-sourced" as TrustClassification,
  };

  return onchainPolicyProof;
}

// ── Internal helpers ─────────────────────────────────────────────

async function readStorage(
  client: PublicClient,
  address: Address,
  slot: Hex,
  blockNumber: bigint
): Promise<Hex> {
  const result = await client.getStorageAt({
    address,
    slot,
    blockNumber,
  });
  return (result ?? "0x0") as Hex;
}

/**
 * Walk a sentinel linked list in a Solidity mapping.
 * Chain: SENTINEL -> item1 -> item2 -> ... -> SENTINEL
 */
async function walkLinkedList(
  client: PublicClient,
  safeAddress: Address,
  slotFn: (addr: Address) => Hex,
  maxItems: number,
  blockNumber: bigint
): Promise<Address[]> {
  const items: Address[] = [];
  let current: Address = SENTINEL;

  for (let i = 0; i < maxItems + 1; i++) {
    const slot = slotFn(current);
    const raw = await readStorage(client, safeAddress, slot, blockNumber);
    const next = storageToAddress(raw);

    // End of list: points back to sentinel or is zero
    if (
      next.toLowerCase() === SENTINEL.toLowerCase() ||
      next.toLowerCase() === ZERO_ADDRESS.toLowerCase()
    ) {
      break;
    }

    items.push(next);
    current = next;
  }

  return items;
}
