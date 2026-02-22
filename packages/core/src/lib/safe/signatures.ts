import { recoverAddress, hashMessage } from "viem";
import type { Hash, Hex, Address } from "viem";

export type SignatureCheckResult =
  | { status: "valid"; recoveredSigner: Address }
  | { status: "invalid"; recoveredSigner: Address }
  | { status: "unsupported"; reason: string };

/**
 * Verify an EOA signature against the safeTxHash and claimed owner.
 *
 * Safe signatures use one of two schemes:
 *   - v ∈ {27, 28}: raw EIP-712 hash signed directly (legacy / typical)
 *   - v ∈ {31, 32}: eth_sign style, the hash is wrapped with "\x19Ethereum Signed Message:\n32"
 *     before recovery, and v is adjusted by subtracting 4
 *
 * Contract signatures (v = 0) and pre-approved hashes (v = 1) are not verified here.
 */
export async function verifySignature(
  safeTxHash: Hash,
  signature: Hex,
  owner: Address
): Promise<SignatureCheckResult> {
  // Signature should be 65 bytes (130 hex chars after 0x)
  if (signature.length !== 132) {
    return { status: "unsupported", reason: "Non-standard signature length" };
  }

  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  const v = parseInt(signature.slice(130, 132), 16);

  try {
    let recoveredSigner: Address;

    if (v === 27 || v === 28) {
      // Standard ECDSA: signed the raw EIP-712 safeTxHash
      recoveredSigner = await recoverAddress({
        hash: safeTxHash,
        signature: { r, s, v: BigInt(v) },
      });
    } else if (v === 31 || v === 32) {
      // eth_sign: the signer signed an eth_sign-prefixed version of the hash
      const ethSignHash = hashMessage({ raw: safeTxHash });
      const adjustedV = BigInt(v - 4); // 31 → 27, 32 → 28
      recoveredSigner = await recoverAddress({
        hash: ethSignHash,
        signature: { r, s, v: adjustedV },
      });
    } else if (v === 0 || v === 1) {
      // v=0: contract signature, v=1: pre-approved hash, can't verify locally
      return { status: "unsupported", reason: v === 0 ? "Contract signature" : "Pre-approved hash" };
    } else {
      return { status: "unsupported", reason: `Unknown signature type (v=${v})` };
    }

    const valid = recoveredSigner.toLowerCase() === owner.toLowerCase();
    return { status: valid ? "valid" : "invalid", recoveredSigner };
  } catch (err) {
    // ECDSA recovery can fail for malformed signatures (invalid curve points,
    // out-of-range s values, etc). This is not an internal error — it means the
    // signature data is cryptographically invalid. We surface the underlying
    // reason so auditors/users can distinguish "can't verify this type" from
    // "verification threw an error".
    const detail = err instanceof Error ? err.message : "Unknown recovery error";
    return { status: "unsupported", reason: `Recovery failed: ${detail}` };
  }
}
