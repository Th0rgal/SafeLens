/**
 * Policy proof verification tests.
 *
 * Uses a real eth_getProof response from Ethereum mainnet for the Safe at
 * 0x9fC3dc011b461664c835F2527fffb1169b3C213e, the same Safe used in
 * the CowSwap TWAP test fixture.
 */

import { describe, it, expect } from "vitest";
import { verifyPolicyProof } from "../verify-policy";
import { verifyAccountProof, verifyStorageProof } from "../mpt";
import type { OnchainPolicyProof } from "../../types";
import type { Address, Hex } from "viem";
import {
  slotToKey,
  SLOT_SINGLETON,
  SLOT_OWNER_COUNT,
  SLOT_THRESHOLD,
  SLOT_NONCE,
  GUARD_STORAGE_SLOT,
  FALLBACK_HANDLER_STORAGE_SLOT,
} from "../safe-layout";

// Load real on-chain proof data
import fixtureJson from "./fixtures/safe-policy-proof.json";

function makeProof(): OnchainPolicyProof {
  return {
    blockNumber: fixtureJson.blockNumber,
    stateRoot: fixtureJson.stateRoot as Hex,
    accountProof: {
      address: fixtureJson.accountProof.address as Address,
      balance: fixtureJson.accountProof.balance,
      codeHash: fixtureJson.accountProof.codeHash as Hex,
      nonce: fixtureJson.accountProof.nonce,
      storageHash: fixtureJson.accountProof.storageHash as Hex,
      accountProof: fixtureJson.accountProof.accountProof as Hex[],
      storageProof: fixtureJson.accountProof.storageProof.map((sp) => ({
        key: sp.key as Hex,
        value: sp.value as Hex,
        proof: sp.proof as Hex[],
      })),
    },
    decodedPolicy: {
      owners: fixtureJson.decodedPolicy.owners as Address[],
      threshold: fixtureJson.decodedPolicy.threshold,
      nonce: fixtureJson.decodedPolicy.nonce,
      modules: fixtureJson.decodedPolicy.modules as Address[],
      guard: fixtureJson.decodedPolicy.guard as Address,
      fallbackHandler: fixtureJson.decodedPolicy.fallbackHandler as Address,
      singleton: fixtureJson.decodedPolicy.singleton as Address,
    },
    trust: "proof-verified",
  };
}

describe("verifyAccountProof with real mainnet data", () => {
  it("verifies the Safe account proof against the state root", () => {
    const proof = makeProof();
    const result = verifyAccountProof(proof.stateRoot as Hex, {
      address: fixtureJson.accountProof.address as Address,
      balance: fixtureJson.accountProof.balance,
      codeHash: fixtureJson.accountProof.codeHash as Hex,
      nonce: fixtureJson.accountProof.nonce,
      storageHash: fixtureJson.accountProof.storageHash as Hex,
      accountProof: fixtureJson.accountProof.accountProof as Hex[],
      storageProof: fixtureJson.accountProof.storageProof.map((sp) => ({
        key: sp.key as Hex,
        value: sp.value as Hex,
        proof: sp.proof as Hex[],
      })),
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects account proof with wrong state root", () => {
    const result = verifyAccountProof(
      "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
      {
        address: fixtureJson.accountProof.address as Address,
        balance: fixtureJson.accountProof.balance,
        codeHash: fixtureJson.accountProof.codeHash as Hex,
        nonce: fixtureJson.accountProof.nonce,
        storageHash: fixtureJson.accountProof.storageHash as Hex,
        accountProof: fixtureJson.accountProof.accountProof as Hex[],
        storageProof: [],
      }
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Root node hash mismatch");
  });
});

describe("verifyStorageProof with real mainnet data", () => {
  it("verifies all storage proofs against the storage root", () => {
    const storageRoot = fixtureJson.accountProof.storageHash as Hex;

    for (const sp of fixtureJson.accountProof.storageProof) {
      const result = verifyStorageProof(storageRoot, {
        key: sp.key as Hex,
        value: sp.value as Hex,
        proof: sp.proof as Hex[],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("rejects storage proof with wrong storage root", () => {
    const sp = fixtureJson.accountProof.storageProof[0];
    const result = verifyStorageProof(
      "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
      {
        key: sp.key as Hex,
        value: sp.value as Hex,
        proof: sp.proof as Hex[],
      }
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Root node hash mismatch");
  });
});

describe("verifyPolicyProof end-to-end with real mainnet data", () => {
  it("validates a correct proof with all checks passing", () => {
    const proof = makeProof();
    const result = verifyPolicyProof(
      proof,
      fixtureJson.safeAddress as Address
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Verify specific checks
    const checkIds = result.checks.map((c) => c.id);
    expect(checkIds).toContain("account-proof");
    expect(checkIds).toContain("storage-proofs");
    expect(checkIds).toContain("threshold");
    expect(checkIds).toContain("nonce");
    expect(checkIds).toContain("owner-count");
    expect(checkIds).toContain("owners-linked-list");
    expect(checkIds).toContain("modules-linked-list");

    // All checks should pass
    for (const check of result.checks) {
      expect(check.passed).toBe(true);
    }
  });

  it("reports correct Safe policy from the proof", () => {
    const proof = makeProof();
    const result = verifyPolicyProof(
      proof,
      fixtureJson.safeAddress as Address
    );

    // Known policy from the real Safe
    expect(proof.decodedPolicy.owners).toHaveLength(5);
    expect(proof.decodedPolicy.threshold).toBe(3);
    expect(proof.decodedPolicy.nonce).toBe(28);
    expect(proof.decodedPolicy.modules).toHaveLength(0);
    expect(proof.decodedPolicy.guard).toBe(
      "0x0000000000000000000000000000000000000000"
    );

    // Proof should validate all of these
    expect(result.valid).toBe(true);
  });

  it("detects tampered threshold", () => {
    const proof = makeProof();
    proof.decodedPolicy.threshold = 5; // Real threshold is 3

    const result = verifyPolicyProof(
      proof,
      fixtureJson.safeAddress as Address
    );

    expect(result.valid).toBe(false);
    const thresholdCheck = result.checks.find((c) => c.id === "threshold");
    expect(thresholdCheck?.passed).toBe(false);
    expect(thresholdCheck?.detail).toContain("Mismatch");
  });

  it("detects tampered nonce", () => {
    const proof = makeProof();
    proof.decodedPolicy.nonce = 999; // Real nonce is 28

    const result = verifyPolicyProof(
      proof,
      fixtureJson.safeAddress as Address
    );

    expect(result.valid).toBe(false);
    const nonceCheck = result.checks.find((c) => c.id === "nonce");
    expect(nonceCheck?.passed).toBe(false);
  });

  it("detects tampered owner count", () => {
    const proof = makeProof();
    // Remove one owner but keep the proof data
    proof.decodedPolicy.owners = proof.decodedPolicy.owners.slice(0, 3);

    const result = verifyPolicyProof(
      proof,
      fixtureJson.safeAddress as Address
    );

    expect(result.valid).toBe(false);
    // Either owner-count or owners-linked-list should fail
    const failedChecks = result.checks.filter((c) => !c.passed);
    expect(failedChecks.length).toBeGreaterThan(0);
  });

  it("detects tampered singleton", () => {
    const proof = makeProof();
    proof.decodedPolicy.singleton =
      "0x0000000000000000000000000000000000000000" as Address;

    const result = verifyPolicyProof(
      proof,
      fixtureJson.safeAddress as Address
    );

    expect(result.valid).toBe(false);
    const singletonCheck = result.checks.find((c) => c.id === "singleton");
    expect(singletonCheck?.passed).toBe(false);
  });

  it("detects tampered fallback handler", () => {
    const proof = makeProof();
    proof.decodedPolicy.fallbackHandler =
      "0x0000000000000000000000000000000000000000" as Address;

    const result = verifyPolicyProof(
      proof,
      fixtureJson.safeAddress as Address
    );

    expect(result.valid).toBe(false);
    const fallbackCheck = result.checks.find(
      (c) => c.id === "fallback-handler"
    );
    expect(fallbackCheck?.passed).toBe(false);
  });

  it("detects wrong safe address (account proof mismatch)", () => {
    const proof = makeProof();

    const result = verifyPolicyProof(
      proof,
      "0x0000000000000000000000000000000000000001" as Address
    );

    expect(result.valid).toBe(false);
    const accountCheck = result.checks.find((c) => c.id === "account-proof");
    expect(accountCheck?.passed).toBe(false);
    // Should catch the mismatch in the defense-in-depth address check
    expect(accountCheck?.detail).toContain("does not match");
  });

  it("detects tampered proof address (embedded address differs from expected)", () => {
    const proof = makeProof();
    // Tamper the embedded address while keeping safeAddress correct
    proof.accountProof.address =
      "0x0000000000000000000000000000000000000BAD" as Address;

    const result = verifyPolicyProof(
      proof,
      fixtureJson.safeAddress as Address
    );

    expect(result.valid).toBe(false);
    const accountCheck = result.checks.find((c) => c.id === "account-proof");
    expect(accountCheck?.passed).toBe(false);
    expect(accountCheck?.detail).toContain("does not match");
  });

  it("validates owners linked list completeness", () => {
    const proof = makeProof();
    const result = verifyPolicyProof(
      proof,
      fixtureJson.safeAddress as Address
    );

    const ownersCheck = result.checks.find(
      (c) => c.id === "owners-linked-list"
    );
    expect(ownersCheck?.passed).toBe(true);
    expect(ownersCheck?.detail).toContain("SENTINEL");
    expect(ownersCheck?.detail).toContain("→");
  });

  it("validates empty modules list", () => {
    const proof = makeProof();
    const result = verifyPolicyProof(
      proof,
      fixtureJson.safeAddress as Address
    );

    const modulesCheck = result.checks.find(
      (c) => c.id === "modules-linked-list"
    );
    expect(modulesCheck?.passed).toBe(true);
    expect(modulesCheck?.detail).toContain("sentinel");
  });

  it("accepts compact quantity keys for direct storage slots", () => {
    const proof = makeProof();
    const compactSlotKeys = new Map<string, Hex>([
      [slotToKey(SLOT_SINGLETON).toLowerCase(), "0x0" as Hex],
      [slotToKey(SLOT_OWNER_COUNT).toLowerCase(), "0x3" as Hex],
      [slotToKey(SLOT_THRESHOLD).toLowerCase(), "0x4" as Hex],
      [slotToKey(SLOT_NONCE).toLowerCase(), "0x5" as Hex],
    ]);

    proof.accountProof.storageProof = proof.accountProof.storageProof.map((sp) => ({
      ...sp,
      key: compactSlotKeys.get(sp.key.toLowerCase()) ?? sp.key,
    }));

    const result = verifyPolicyProof(proof, fixtureJson.safeAddress as Address);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("verifyPolicyProof rejects missing storage proof keys", () => {
  /** Strip a specific storage key from the proof and return a new proof object. */
  function stripStorageKey(key: Hex): OnchainPolicyProof {
    const proof = makeProof();
    const normalizedKey = key.toLowerCase();
    proof.accountProof.storageProof = proof.accountProof.storageProof.filter(
      (sp) => sp.key.toLowerCase() !== normalizedKey
    );
    return proof;
  }

  it("fails when singleton proof key is missing", () => {
    const proof = stripStorageKey(slotToKey(SLOT_SINGLETON));
    const result = verifyPolicyProof(proof, fixtureJson.safeAddress as Address);

    expect(result.valid).toBe(false);
    const check = result.checks.find((c) => c.id === "singleton");
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain("No storage proof provided");
  });

  it("fails when threshold proof key is missing", () => {
    const proof = stripStorageKey(slotToKey(SLOT_THRESHOLD));
    const result = verifyPolicyProof(proof, fixtureJson.safeAddress as Address);

    expect(result.valid).toBe(false);
    const check = result.checks.find((c) => c.id === "threshold");
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain("No storage proof provided");
  });

  it("fails when nonce proof key is missing", () => {
    const proof = stripStorageKey(slotToKey(SLOT_NONCE));
    const result = verifyPolicyProof(proof, fixtureJson.safeAddress as Address);

    expect(result.valid).toBe(false);
    const check = result.checks.find((c) => c.id === "nonce");
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain("No storage proof provided");
  });

  it("fails when ownerCount proof key is missing", () => {
    const proof = stripStorageKey(slotToKey(SLOT_OWNER_COUNT));
    const result = verifyPolicyProof(proof, fixtureJson.safeAddress as Address);

    expect(result.valid).toBe(false);
    const check = result.checks.find((c) => c.id === "owner-count");
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain("No storage proof provided");
  });

  it("fails when guard proof key is missing", () => {
    const proof = stripStorageKey(GUARD_STORAGE_SLOT);
    const result = verifyPolicyProof(proof, fixtureJson.safeAddress as Address);

    expect(result.valid).toBe(false);
    const check = result.checks.find((c) => c.id === "guard");
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain("No storage proof provided");
  });

  it("fails when fallback handler proof key is missing", () => {
    const proof = stripStorageKey(FALLBACK_HANDLER_STORAGE_SLOT);
    const result = verifyPolicyProof(proof, fixtureJson.safeAddress as Address);

    expect(result.valid).toBe(false);
    const check = result.checks.find((c) => c.id === "fallback-handler");
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain("No storage proof provided");
  });
});
