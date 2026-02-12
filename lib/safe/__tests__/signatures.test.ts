import { describe, it, expect } from "vitest";
import { verifySignature } from "../signatures";
import type { Hash, Hex, Address } from "viem";
import {
  COWSWAP_TWAP_TX,
  EXPECTED_SAFE_TX_HASH,
} from "./fixtures/cowswap-twap-tx";

const safeTxHash = EXPECTED_SAFE_TX_HASH as Hash;
const owner = COWSWAP_TWAP_TX.confirmations[0].owner as Address;
const signature = COWSWAP_TWAP_TX.confirmations[0].signature as Hex;

describe("verifySignature", () => {
  it("verifies a valid v=27 ECDSA signature from the fixture", async () => {
    const result = await verifySignature(safeTxHash, signature, owner);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.recoveredSigner.toLowerCase()).toBe(owner.toLowerCase());
    }
  });

  it("returns invalid when owner does not match signer", async () => {
    const wrongOwner = "0x0000000000000000000000000000000000000001" as Address;
    const result = await verifySignature(safeTxHash, signature, wrongOwner);

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.recoveredSigner.toLowerCase()).toBe(owner.toLowerCase());
    }
  });

  it("returns invalid when safeTxHash is wrong", async () => {
    const wrongHash =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as Hash;
    const result = await verifySignature(wrongHash, signature, owner);

    expect(result.status).toBe("invalid");
  });

  it("returns unsupported for contract signature (v=0)", async () => {
    // Build a 65-byte signature with v=0
    const contractSig = `${signature.slice(0, 130)}00` as Hex;
    const result = await verifySignature(safeTxHash, contractSig, owner);

    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.reason).toBe("Contract signature");
    }
  });

  it("returns unsupported for pre-approved hash (v=1)", async () => {
    const preApprovedSig = `${signature.slice(0, 130)}01` as Hex;
    const result = await verifySignature(safeTxHash, preApprovedSig, owner);

    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.reason).toBe("Pre-approved hash");
    }
  });

  it("returns unsupported for unknown v value", async () => {
    const weirdSig = `${signature.slice(0, 130)}ff` as Hex;
    const result = await verifySignature(safeTxHash, weirdSig, owner);

    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.reason).toContain("Unknown signature type");
    }
  });

  it("returns unsupported for non-standard signature length", async () => {
    const shortSig = "0xabcd" as Hex;
    const result = await verifySignature(safeTxHash, shortSig, owner);

    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.reason).toBe("Non-standard signature length");
    }
  });

  it("handles eth_sign style signatures (v=31)", async () => {
    // v=31 signature won't match the owner since the fixture uses v=27,
    // but it should not throw — just return invalid or valid
    const ethSignSig = `${signature.slice(0, 130)}1f` as Hex; // 0x1f = 31
    const result = await verifySignature(safeTxHash, ethSignSig, owner);

    // Should recover *some* address (not crash), but it won't match owner
    expect(["valid", "invalid", "unsupported"]).toContain(result.status);
  });

  it("handles eth_sign style signatures (v=32)", async () => {
    const ethSignSig = `${signature.slice(0, 130)}20` as Hex; // 0x20 = 32
    const result = await verifySignature(safeTxHash, ethSignSig, owner);

    expect(["valid", "invalid", "unsupported"]).toContain(result.status);
  });
});
