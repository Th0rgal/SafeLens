import { describe, it, expect } from "vitest";
import {
  SLOT_SINGLETON,
  SLOT_MODULES_MAPPING,
  SLOT_OWNERS_MAPPING,
  SLOT_OWNER_COUNT,
  SLOT_THRESHOLD,
  SLOT_NONCE,
  SENTINEL,
  GUARD_STORAGE_SLOT,
  FALLBACK_HANDLER_STORAGE_SLOT,
  ownerSlot,
  moduleSlot,
  slotToKey,
  getFixedPolicyStorageKeys,
  mappingSlot,
} from "../safe-layout";
import { keccak256, toHex, encodePacked, encodeAbiParameters, parseAbiParameters } from "viem";

describe("Safe storage layout constants", () => {
  it("has correct fixed slot numbers matching pcaversaccio reference", () => {
    expect(SLOT_SINGLETON).toBe(0n);
    expect(SLOT_MODULES_MAPPING).toBe(1n);
    expect(SLOT_OWNERS_MAPPING).toBe(2n);
    expect(SLOT_OWNER_COUNT).toBe(3n);
    expect(SLOT_THRESHOLD).toBe(4n);
    expect(SLOT_NONCE).toBe(5n);
  });

  it("has correct sentinel address", () => {
    expect(SENTINEL).toBe("0x0000000000000000000000000000000000000001");
  });

  it("computes guard storage slot from keccak256 of the string", () => {
    const computed = keccak256(toHex("guard_manager.guard.address"));
    expect(GUARD_STORAGE_SLOT).toBe(computed);
  });

  it("computes fallback handler storage slot from keccak256 of the string", () => {
    const computed = keccak256(toHex("fallback_manager.handler.address"));
    expect(FALLBACK_HANDLER_STORAGE_SLOT).toBe(computed);
  });
});

describe("mappingSlot", () => {
  it("computes keccak256(abi.encode(key, slot)) for Solidity mapping layout", () => {
    const addr = "0x1111111111111111111111111111111111111111" as const;
    const slot = 2n;

    // Manual computation: keccak256(abi.encode(address, uint256))
    const manual = keccak256(
      encodeAbiParameters(parseAbiParameters("address, uint256"), [addr, slot])
    );

    expect(mappingSlot(addr, slot)).toBe(manual);
  });

  it("ownerSlot uses mapping slot 2", () => {
    const addr = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
    expect(ownerSlot(addr)).toBe(mappingSlot(addr, 2n));
  });

  it("moduleSlot uses mapping slot 1", () => {
    const addr = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
    expect(moduleSlot(addr)).toBe(mappingSlot(addr, 1n));
  });
});

describe("slotToKey", () => {
  it("pads slot number to 32-byte hex", () => {
    expect(slotToKey(0n)).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    expect(slotToKey(4n)).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000004"
    );
    expect(slotToKey(255n)).toBe(
      "0x00000000000000000000000000000000000000000000000000000000000000ff"
    );
  });
});

describe("getFixedPolicyStorageKeys", () => {
  it("returns all required fixed storage keys", () => {
    const keys = getFixedPolicyStorageKeys();

    expect(keys.singleton).toBe(slotToKey(0n));
    expect(keys.ownerCount).toBe(slotToKey(3n));
    expect(keys.threshold).toBe(slotToKey(4n));
    expect(keys.nonce).toBe(slotToKey(5n));
    expect(keys.guard).toBe(GUARD_STORAGE_SLOT);
    expect(keys.fallbackHandler).toBe(FALLBACK_HANDLER_STORAGE_SLOT);
    expect(keys.modulesSentinel).toBe(moduleSlot(SENTINEL));
    expect(keys.ownersSentinel).toBe(ownerSlot(SENTINEL));
  });
});
