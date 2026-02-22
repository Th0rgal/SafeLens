/**
 * On-chain Safe policy proof verification.
 *
 * Verifies that the `onchainPolicyProof` section of an evidence package
 * is cryptographically valid by:
 *
 * 1. Verifying the account proof against the state root
 * 2. Verifying each storage proof against the account's storage root
 * 3. Decoding proven storage values and comparing against decodedPolicy
 * 4. Validating the owners and modules linked lists are complete
 */

import { type Address, type Hex, zeroAddress } from "viem";
import type { OnchainPolicyProof } from "../types";
import {
  verifyAccountProof,
  verifyStorageProof,
  normalizeStorageSlotKey,
  type AccountProofInput,
  type StorageProofInput,
} from "./mpt";
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

// ── Result types ───────────────────────────────────────────────────

export interface PolicyProofVerificationResult {
  valid: boolean;
  errors: string[];
  /** Which specific checks passed / failed */
  checks: PolicyProofCheck[];
}

export interface PolicyProofCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Extract an address from a 32-byte storage value.
 * Addresses are stored right-aligned in 32 bytes.
 */
function storageValueToAddress(value: Hex): Address {
  // Take last 40 hex chars (20 bytes)
  const hex = value.replace(/^0x/, "").padStart(64, "0");
  return `0x${hex.slice(24)}` as Address;
}

/**
 * Extract a uint256 from a 32-byte storage value.
 */
function storageValueToUint(value: Hex): bigint {
  if (
    value === "0x" ||
    value === "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    return 0n;
  }
  return BigInt(value);
}

/**
 * Find a storage proof by its key in the proof array.
 */
function findStorageProof(
  proofs: StorageProofInput[],
  key: Hex
): StorageProofInput | undefined {
  const normalizedKey = normalizeStorageSlotKey(key);
  return proofs.find((proof) => {
    try {
      return normalizeStorageSlotKey(proof.key) === normalizedKey;
    } catch {
      return false;
    }
  });
}

/**
 * Normalize an address to lowercase for comparison.
 */
function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

// ── Main verification function ─────────────────────────────────────

export function verifyPolicyProof(
  proof: OnchainPolicyProof,
  safeAddress: Address
): PolicyProofVerificationResult {
  const errors: string[] = [];
  const checks: PolicyProofCheck[] = [];

  // 0. Defense-in-depth: verify the proof's embedded address matches the
  // expected Safe address. The MPT path is derived from safeAddress, so a
  // mismatch wouldn't break cryptographic verification, but catching it
  // early gives a clearer error message and prevents confusion.
  if (
    proof.accountProof.address.toLowerCase() !== safeAddress.toLowerCase()
  ) {
    const detail = `Proof address ${proof.accountProof.address} does not match expected Safe ${safeAddress}`;
    errors.push(detail);
    checks.push({
      id: "account-proof",
      label: "Account proof against state root",
      passed: false,
      detail,
    });
    return { valid: false, checks, errors };
  }

  const accountInput: AccountProofInput = {
    address: safeAddress,
    balance: proof.accountProof.balance,
    codeHash: proof.accountProof.codeHash as Hex,
    nonce: proof.accountProof.nonce,
    storageHash: proof.accountProof.storageHash as Hex,
    accountProof: proof.accountProof.accountProof as Hex[],
    storageProof: proof.accountProof.storageProof.map((sp) => ({
      key: sp.key as Hex,
      value: sp.value as Hex,
      proof: sp.proof as Hex[],
    })),
  };

  // 1. Verify account proof against state root
  const accountResult = verifyAccountProof(
    proof.stateRoot as Hex,
    accountInput
  );

  checks.push({
    id: "account-proof",
    label: "Account proof against state root",
    passed: accountResult.valid,
    detail: accountResult.valid
      ? `Account ${safeAddress} proven at block ${proof.blockNumber}`
      : accountResult.errors.join("; "),
  });

  if (!accountResult.valid) {
    errors.push(
      `Account proof verification failed: ${accountResult.errors.join("; ")}`
    );
    return { valid: false, errors, checks };
  }

  const storageRoot = proof.accountProof.storageHash as Hex;
  const storageProofs = accountInput.storageProof;

  // 2. Verify each individual storage proof against the storage root
  let allStorageProofsValid = true;
  for (const sp of storageProofs) {
    const result = verifyStorageProof(storageRoot, sp);
    if (!result.valid) {
      allStorageProofsValid = false;
      errors.push(
        `Storage proof for key ${sp.key} failed: ${result.errors.join("; ")}`
      );
    }
  }

  checks.push({
    id: "storage-proofs",
    label: "Storage proofs against storage root",
    passed: allStorageProofsValid,
    detail: allStorageProofsValid
      ? `${storageProofs.length} storage slots verified`
      : errors[errors.length - 1],
  });

  if (!allStorageProofsValid) {
    return { valid: false, errors, checks };
  }

  // 3. Verify singleton (slot 0)
  const singletonProof = findStorageProof(
    storageProofs,
    slotToKey(SLOT_SINGLETON)
  );
  if (!singletonProof) {
    errors.push("Missing storage proof for singleton (slot 0)");
    checks.push({
      id: "singleton",
      label: "Singleton (implementation)",
      passed: false,
      detail: "No storage proof provided for singleton slot",
    });
  } else {
    const provenSingleton = storageValueToAddress(singletonProof.value);
    const claimed = normalizeAddress(proof.decodedPolicy.singleton);
    const proven = normalizeAddress(provenSingleton);
    const match = proven === claimed;
    checks.push({
      id: "singleton",
      label: "Singleton (implementation)",
      passed: match,
      detail: match
        ? `Proven: ${provenSingleton}`
        : `Mismatch: proven ${provenSingleton}, claimed ${proof.decodedPolicy.singleton}`,
    });
    if (!match) {
      errors.push(
        `Singleton mismatch: proven ${provenSingleton}, claimed ${proof.decodedPolicy.singleton}`
      );
    }
  }

  // 4. Verify threshold (slot 4)
  const thresholdProof = findStorageProof(
    storageProofs,
    slotToKey(SLOT_THRESHOLD)
  );
  if (!thresholdProof) {
    errors.push("Missing storage proof for threshold (slot 4)");
    checks.push({
      id: "threshold",
      label: "Threshold",
      passed: false,
      detail: "No storage proof provided for threshold slot",
    });
  } else {
    const provenThreshold = Number(storageValueToUint(thresholdProof.value));
    const match = provenThreshold === proof.decodedPolicy.threshold;
    checks.push({
      id: "threshold",
      label: "Threshold",
      passed: match,
      detail: match
        ? `Proven: ${provenThreshold}`
        : `Mismatch: proven ${provenThreshold}, claimed ${proof.decodedPolicy.threshold}`,
    });
    if (!match) {
      errors.push(
        `Threshold mismatch: proven ${provenThreshold}, claimed ${proof.decodedPolicy.threshold}`
      );
    }
  }

  // 5. Verify nonce (slot 5)
  const nonceProof = findStorageProof(storageProofs, slotToKey(SLOT_NONCE));
  if (!nonceProof) {
    errors.push("Missing storage proof for nonce (slot 5)");
    checks.push({
      id: "nonce",
      label: "Nonce",
      passed: false,
      detail: "No storage proof provided for nonce slot",
    });
  } else {
    const provenNonce = Number(storageValueToUint(nonceProof.value));
    const match = provenNonce === proof.decodedPolicy.nonce;
    checks.push({
      id: "nonce",
      label: "Nonce",
      passed: match,
      detail: match
        ? `Proven: ${provenNonce}`
        : `Mismatch: proven ${provenNonce}, claimed ${proof.decodedPolicy.nonce}`,
    });
    if (!match) {
      errors.push(
        `Nonce mismatch: proven ${provenNonce}, claimed ${proof.decodedPolicy.nonce}`
      );
    }
  }

  // 6. Verify ownerCount (slot 3)
  const ownerCountProof = findStorageProof(
    storageProofs,
    slotToKey(SLOT_OWNER_COUNT)
  );
  if (!ownerCountProof) {
    errors.push("Missing storage proof for ownerCount (slot 3)");
    checks.push({
      id: "owner-count",
      label: "Owner count",
      passed: false,
      detail: "No storage proof provided for ownerCount slot",
    });
  } else {
    const provenOwnerCount = Number(
      storageValueToUint(ownerCountProof.value)
    );
    const claimedOwnerCount = proof.decodedPolicy.owners.length;
    const match = provenOwnerCount === claimedOwnerCount;
    checks.push({
      id: "owner-count",
      label: "Owner count",
      passed: match,
      detail: match
        ? `Proven: ${provenOwnerCount}`
        : `Mismatch: proven ${provenOwnerCount}, claimed ${claimedOwnerCount}`,
    });
    if (!match) {
      errors.push(
        `Owner count mismatch: proven ${provenOwnerCount}, claimed ${claimedOwnerCount}`
      );
    }
  }

  // 7. Verify owners linked list (mapping at slot 2)
  const ownersResult = verifyLinkedList(
    storageProofs,
    proof.decodedPolicy.owners,
    (addr: Address) => ownerSlot(addr),
    "owners"
  );
  checks.push(...ownersResult.checks);
  if (!ownersResult.valid) {
    errors.push(...ownersResult.errors);
  }

  // 8. Verify guard (keccak256 sentinel slot)
  const guardProof = findStorageProof(storageProofs, GUARD_STORAGE_SLOT);
  if (!guardProof) {
    errors.push("Missing storage proof for guard slot");
    checks.push({
      id: "guard",
      label: "Guard",
      passed: false,
      detail: "No storage proof provided for guard slot",
    });
  } else {
    const provenGuard = storageValueToAddress(guardProof.value);
    const claimed = normalizeAddress(proof.decodedPolicy.guard);
    const proven = normalizeAddress(provenGuard);
    const match = proven === claimed;
    checks.push({
      id: "guard",
      label: "Guard",
      passed: match,
      detail: match
        ? `Proven: ${provenGuard}`
        : `Mismatch: proven ${provenGuard}, claimed ${proof.decodedPolicy.guard}`,
    });
    if (!match) {
      errors.push(
        `Guard mismatch: proven ${provenGuard}, claimed ${proof.decodedPolicy.guard}`
      );
    }
  }

  // 9. Verify fallback handler (keccak256 sentinel slot)
  const fallbackProof = findStorageProof(
    storageProofs,
    FALLBACK_HANDLER_STORAGE_SLOT
  );
  if (!fallbackProof) {
    errors.push("Missing storage proof for fallback handler slot");
    checks.push({
      id: "fallback-handler",
      label: "Fallback handler",
      passed: false,
      detail: "No storage proof provided for fallback handler slot",
    });
  } else {
    const provenFallback = storageValueToAddress(fallbackProof.value);
    const claimed = normalizeAddress(proof.decodedPolicy.fallbackHandler);
    const proven = normalizeAddress(provenFallback);
    const match = proven === claimed;
    checks.push({
      id: "fallback-handler",
      label: "Fallback handler",
      passed: match,
      detail: match
        ? `Proven: ${provenFallback}`
        : `Mismatch: proven ${provenFallback}, claimed ${proof.decodedPolicy.fallbackHandler}`,
    });
    if (!match) {
      errors.push(
        `Fallback handler mismatch: proven ${provenFallback}, claimed ${proof.decodedPolicy.fallbackHandler}`
      );
    }
  }

  // 10. Verify modules linked list (mapping at slot 1)
  const modulesResult = verifyLinkedList(
    storageProofs,
    proof.decodedPolicy.modules,
    (addr: Address) => moduleSlot(addr),
    "modules"
  );
  checks.push(...modulesResult.checks);
  if (!modulesResult.valid) {
    errors.push(...modulesResult.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
    checks,
  };
}

// ── Linked list verification ───────────────────────────────────────

interface LinkedListVerificationResult {
  valid: boolean;
  errors: string[];
  checks: PolicyProofCheck[];
}

/**
 * Verify a sentinel linked list stored in a Solidity mapping.
 *
 * The list is: SENTINEL -> item1 -> item2 -> ... -> itemN -> SENTINEL
 *
 * For each step in the chain, we need a storage proof for mapping[currentAddr]
 * which should equal the next address in the chain.
 */
function verifyLinkedList(
  storageProofs: StorageProofInput[],
  claimedItems: string[],
  slotFn: (addr: Address) => Hex,
  name: string
): LinkedListVerificationResult {
  const errors: string[] = [];
  const checks: PolicyProofCheck[] = [];

  // Verify SENTINEL -> first item
  const sentinelSlot = slotFn(SENTINEL);
  const sentinelProof = findStorageProof(storageProofs, sentinelSlot);

  if (!sentinelProof) {
    // No proof for sentinel, can't verify the list
    checks.push({
      id: `${name}-linked-list`,
      label: `${name} linked list`,
      passed: false,
      detail: `No storage proof for ${name} sentinel slot`,
    });
    errors.push(`Missing storage proof for ${name} sentinel slot`);
    return { valid: false, errors, checks };
  }

  if (claimedItems.length === 0) {
    // Empty list: SENTINEL should point to SENTINEL (initialized) or
    // ZERO_ADDRESS (uninitialized storage, slot was never written).
    const provenNext = storageValueToAddress(sentinelProof.value);
    const normalized = normalizeAddress(provenNext);
    const match =
      normalized === normalizeAddress(SENTINEL) ||
      normalized === normalizeAddress(zeroAddress);
    checks.push({
      id: `${name}-linked-list`,
      label: `${name} linked list (empty)`,
      passed: match,
      detail: match
        ? "Proven empty: sentinel points to sentinel"
        : `Expected empty list but sentinel points to ${provenNext}`,
    });
    if (!match) {
      errors.push(
        `${name} list: expected empty but sentinel points to ${provenNext}`
      );
    }
    return { valid: match, errors, checks };
  }

  // Walk the chain: SENTINEL -> item[0] -> item[1] -> ... -> SENTINEL
  let currentAddr: Address = SENTINEL;
  const expectedChain = [...claimedItems, SENTINEL]; // last item should point to SENTINEL

  for (let i = 0; i < expectedChain.length; i++) {
    const expectedNext = expectedChain[i];
    const currentSlot = slotFn(currentAddr);
    const proof = findStorageProof(storageProofs, currentSlot);

    if (!proof) {
      errors.push(
        `Missing storage proof for ${name}[${currentAddr}] at step ${i}`
      );
      checks.push({
        id: `${name}-linked-list`,
        label: `${name} linked list`,
        passed: false,
        detail: `Missing proof at step ${i} for ${currentAddr}`,
      });
      return { valid: false, errors, checks };
    }

    const provenNext = storageValueToAddress(proof.value);
    if (
      normalizeAddress(provenNext) !== normalizeAddress(expectedNext)
    ) {
      errors.push(
        `${name} list step ${i}: proven ${provenNext} ≠ expected ${expectedNext}`
      );
      checks.push({
        id: `${name}-linked-list`,
        label: `${name} linked list`,
        passed: false,
        detail: `Chain broken at step ${i}: ${currentAddr} → ${provenNext} (expected ${expectedNext})`,
      });
      return { valid: false, errors, checks };
    }

    currentAddr = expectedNext as Address;
  }

  checks.push({
    id: `${name}-linked-list`,
    label: `${name} linked list`,
    passed: true,
    detail: `Chain verified: SENTINEL → ${claimedItems.join(" → ")} → SENTINEL`,
  });

  return { valid: true, errors: [], checks };
}
