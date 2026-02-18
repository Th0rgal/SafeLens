/**
 * Safe contract storage layout constants and slot computation.
 *
 * Storage layout (stable since Safe v0.1.0):
 *   Slot 0: singleton (masterCopy / implementation address)
 *   Slot 1: modules mapping (address => address, sentinel linked list)
 *   Slot 2: owners mapping (address => address, sentinel linked list)
 *   Slot 3: ownerCount
 *   Slot 4: threshold
 *   Slot 5: nonce
 *
 * Out-of-band slots:
 *   keccak256("guard_manager.guard.address")        => guard
 *   keccak256("fallback_manager.handler.address")    => fallback handler
 *
 * Reference: https://github.com/pcaversaccio/safe-tx-hashes-util
 */

import {
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  pad,
  type Address,
  type Hex,
} from "viem";

// ── Fixed slot numbers ─────────────────────────────────────────────

export const SLOT_SINGLETON = 0n;
export const SLOT_MODULES_MAPPING = 1n;
export const SLOT_OWNERS_MAPPING = 2n;
export const SLOT_OWNER_COUNT = 3n;
export const SLOT_THRESHOLD = 4n;
export const SLOT_NONCE = 5n;

// ── Sentinel address ───────────────────────────────────────────────

export const SENTINEL: Address = "0x0000000000000000000000000000000000000001";

// ── Out-of-band storage slots ──────────────────────────────────────

export const GUARD_STORAGE_SLOT: Hex =
  "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";

export const FALLBACK_HANDLER_STORAGE_SLOT: Hex =
  "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";

// ── Slot computation for Solidity mappings ─────────────────────────

/**
 * Compute the storage slot for `mapping(address => T)` at `mappingSlot`
 * for a given key.
 *
 * Solidity rule: keccak256(abi.encode(key, mappingSlot))
 */
export function mappingSlot(key: Address, mappingSlot: bigint): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256"), [
      key,
      mappingSlot,
    ])
  );
}

/**
 * Compute the storage slot for an owner in the owners linked list.
 * owners[key] where the mapping is at slot 2.
 */
export function ownerSlot(ownerAddress: Address): Hex {
  return mappingSlot(ownerAddress, SLOT_OWNERS_MAPPING);
}

/**
 * Compute the storage slot for a module in the modules linked list.
 * modules[key] where the mapping is at slot 1.
 */
export function moduleSlot(moduleAddress: Address): Hex {
  return mappingSlot(moduleAddress, SLOT_MODULES_MAPPING);
}

/**
 * Convert a bigint slot number to a 32-byte hex key suitable for storage proofs.
 */
export function slotToKey(slot: bigint): Hex {
  return pad(`0x${slot.toString(16)}` as Hex, { size: 32 });
}

// ── All fixed storage keys needed for policy verification ──────────

export interface SafePolicyStorageKeys {
  singleton: Hex;
  ownerCount: Hex;
  threshold: Hex;
  nonce: Hex;
  guard: Hex;
  fallbackHandler: Hex;
  /** Sentinel slot in the modules mapping — modules[SENTINEL] */
  modulesSentinel: Hex;
  /** Sentinel slot in the owners mapping — owners[SENTINEL] */
  ownersSentinel: Hex;
}

/**
 * Return all fixed storage keys needed for a basic policy proof.
 * Dynamic keys (owner chain, module chain) must be computed per-Safe.
 */
export function getFixedPolicyStorageKeys(): SafePolicyStorageKeys {
  return {
    singleton: slotToKey(SLOT_SINGLETON),
    ownerCount: slotToKey(SLOT_OWNER_COUNT),
    threshold: slotToKey(SLOT_THRESHOLD),
    nonce: slotToKey(SLOT_NONCE),
    guard: GUARD_STORAGE_SLOT,
    fallbackHandler: FALLBACK_HANDLER_STORAGE_SLOT,
    modulesSentinel: moduleSlot(SENTINEL),
    ownersSentinel: ownerSlot(SENTINEL),
  };
}
