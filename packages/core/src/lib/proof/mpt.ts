/**
 * Merkle Patricia Trie proof verification.
 *
 * Verifies eth_getProof storage proofs and account proofs against a
 * state root, using only RLP decoding and keccak256, no external
 * trie library required.
 *
 * References:
 *   - Ethereum Yellow Paper, Appendix D (Modified Merkle Patricia Trie)
 *   - EIP-1186 (eth_getProof)
 */

import {
  keccak256,
  toRlp,
  fromRlp,
  toHex,
  hexToBytes,
  bytesToHex,
  type Hex,
  type Address,
} from "viem";

// ── Types ──────────────────────────────────────────────────────────

export interface AccountProofInput {
  address: Address;
  balance: string;
  codeHash: Hex;
  nonce: number;
  storageHash: Hex;
  accountProof: Hex[];
  storageProof: StorageProofInput[];
}

export interface StorageProofInput {
  key: Hex;
  value: Hex;
  proof: Hex[];
}

export interface ProofVerificationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Normalize an eth_getProof storage key to a 32-byte slot word.
 *
 * RPC providers may return compact quantity keys (e.g. `0x0`) for simple
 * storage slots, but trie paths are computed from the canonical 32-byte value.
 */
export function normalizeStorageSlotKey(rawKey: Hex): Hex {
  const hex = rawKey.toLowerCase();
  if (!hex.startsWith("0x") || hex.length < 3) {
    throw new Error("Invalid storage slot key: expected 0x-prefixed hex");
  }

  const digits = hex.slice(2);
  if (!/^[0-9a-f]+$/i.test(digits) || digits.length > 64) {
    throw new Error("Invalid storage slot key: expected <=32 bytes of hex");
  }

  return `0x${digits.padStart(64, "0")}` as Hex;
}

// ── Nibble helpers ─────────────────────────────────────────────────

function bytesToNibbles(bytes: Uint8Array): number[] {
  const nibbles: number[] = [];
  for (const byte of bytes) {
    nibbles.push((byte >> 4) & 0xf);
    nibbles.push(byte & 0xf);
  }
  return nibbles;
}

/**
 * Decode an HP (Hex-Prefix) encoded path.
 * Returns [nibbles, isLeaf].
 */
function decodeHpPath(encoded: Uint8Array): [number[], boolean] {
  const nibbles = bytesToNibbles(encoded);
  const prefix = nibbles[0];
  const isLeaf = prefix >= 2;
  const isOdd = prefix % 2 === 1;

  // Skip the prefix nibble(s)
  if (isOdd) {
    // Odd: first nibble is prefix, second nibble is first path nibble
    return [nibbles.slice(1), isLeaf];
  } else {
    // Even: first two nibbles are prefix + padding
    return [nibbles.slice(2), isLeaf];
  }
}

// ── RLP helpers ────────────────────────────────────────────────────

type RlpItem = Hex | readonly RlpItem[];

function rlpDecodeNode(nodeHex: Hex): RlpItem[] {
  const decoded = fromRlp(nodeHex, "hex");
  if (typeof decoded === "string") {
    return [decoded as Hex];
  }
  return decoded as RlpItem[];
}

function rlpItemToBytes(item: RlpItem): Uint8Array {
  if (typeof item === "string") {
    return hexToBytes(item as Hex);
  }
  // Nested list: encode it back to RLP to get the bytes.
  // RlpItem[] is structurally equivalent to viem's RecursiveArray<Hex>
  // but TypeScript can't unify separately-defined recursive types.
  return hexToBytes(toRlp(item as readonly Hex[]) as Hex);
}

function rlpItemToHex(item: RlpItem): Hex {
  if (typeof item === "string") {
    return item as Hex;
  }
  return toRlp(item as readonly Hex[]) as Hex;
}

// ── Helpers ───────────────────────────────────────────────────────

function isZeroValue(value: Hex): boolean {
  return (
    value === "0x" ||
    value ===
      "0x0000000000000000000000000000000000000000000000000000000000000000"
  );
}

/**
 * Decode an inline (embedded) trie child.
 *
 * Per the Yellow Paper Appendix D, when a child node's RLP encoding
 * is shorter than 32 bytes it is stored inline rather than as a hash
 * reference.  We re-encode the item to RLP, then decode it as a node.
 */
function decodeInlineChild(child: RlpItem): RlpItem[] {
  if (Array.isArray(child)) {
    // Already a decoded list, it IS the node items
    return child as RlpItem[];
  }
  // Raw hex string: decode it as an RLP node
  return rlpDecodeNode(child as Hex);
}

// ── Shared MPT trie walk ──────────────────────────────────────────

/**
 * Leaf match strategy: controls how the proven leaf value is compared
 * against the expected value, and how missing keys are handled.
 */
interface LeafMatcher {
  /** Compare the proven leaf value against the expected value. */
  matchValue(provenValue: Hex, errors: string[]): ProofVerificationResult;
  /** Handle a missing key (path diverges or empty branch child). */
  onKeyMissing(context: string, errors: string[]): ProofVerificationResult;
}

/** Storage leaf matcher: RLP-decodes + normalizes, allows zero-value absence. */
function storageMatcher(expectedValue: Hex): LeafMatcher {
  return {
    matchValue: (provenValue, errors) => verifyValue(provenValue, expectedValue, errors),
    onKeyMissing: (_ctx, errors) => {
      if (isZeroValue(expectedValue)) return { valid: true, errors: [] };
      errors.push(`Key not found in trie (${_ctx})`);
      return { valid: false, errors };
    },
  };
}

/** Account leaf matcher: direct RLP equality, key absence is always an error. */
function accountMatcher(expectedRlpValue: Hex): LeafMatcher {
  return {
    matchValue: (provenValue, errors) => {
      if (provenValue === expectedRlpValue) return { valid: true, errors: [] };
      errors.push("Value mismatch");
      return { valid: false, errors };
    },
    onKeyMissing: (ctx, errors) => {
      errors.push(`Not found in trie (${ctx})`);
      return { valid: false, errors };
    },
  };
}

function nibbleArraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Walk an MPT proof, verifying hash links and returning the leaf value.
 *
 * This is the single trie-walking implementation used by both storage
 * and account proof verification. The `matcher` controls how leaf
 * values are compared and how missing keys are handled.
 */
function walkMptProof(
  rootHash: Hex,
  pathNibbles: number[],
  proof: Hex[],
  matcher: LeafMatcher,
): ProofVerificationResult {
  const errors: string[] = [];
  let pathOffset = 0;
  let currentHash = rootHash;
  let proofIdx = 0;
  let nextNode: RlpItem[] | null = null;

  const MAX_ITERATIONS = proof.length + 64; // inline nodes don't consume proof entries
  for (let guard = 0; guard < MAX_ITERATIONS; guard++) {
    let node: RlpItem[];

    if (nextNode !== null) {
      // Process an inline node, no hash check needed since the
      // parent node that contained it was already hash-verified.
      node = nextNode;
      nextNode = null;
    } else {
      if (proofIdx >= proof.length) {
        errors.push("Proof exhausted before reaching leaf");
        return { valid: false, errors };
      }
      const nodeRlp = proof[proofIdx];
      const nodeHash = keccak256(nodeRlp);

      if (proofIdx === 0) {
        if (nodeHash !== rootHash) {
          errors.push(`Root node hash mismatch: expected ${rootHash}, got ${nodeHash}`);
          return { valid: false, errors };
        }
      } else if (nodeHash !== currentHash) {
        errors.push(`Node ${proofIdx} hash mismatch: expected ${currentHash}, got ${nodeHash}`);
        return { valid: false, errors };
      }

      node = rlpDecodeNode(nodeRlp);
      proofIdx++;
    }

    if (node.length === 17) {
      // Branch node: 16 children + value
      if (pathOffset >= pathNibbles.length) {
        return matcher.matchValue(rlpItemToHex(node[16]), errors);
      }

      const nibble = pathNibbles[pathOffset];
      pathOffset += 1;

      const child = node[nibble];
      const childHex = rlpItemToHex(child);

      if (childHex === "0x" || childHex === "0x80") {
        return matcher.onKeyMissing("empty branch child", errors);
      }

      const childBytes = rlpItemToBytes(child);
      if (childBytes.length === 32) {
        currentHash = bytesToHex(childBytes) as Hex;
      } else {
        // inline node, no hash check needed since it was embedded in a verified parent.
        nextNode = decodeInlineChild(child);
      }
    } else if (node.length === 2) {
      const encodedPath = rlpItemToBytes(node[0]);
      const [nodePath, isLeaf] = decodeHpPath(encodedPath);
      const remainingPath = pathNibbles.slice(pathOffset);

      if (isLeaf) {
        if (!nibbleArraysEqual(nodePath, remainingPath)) {
          return matcher.onKeyMissing("leaf path mismatch", errors);
        }
        return matcher.matchValue(rlpItemToHex(node[1]), errors);
      } else {
        // Extension node
        if (
          remainingPath.length < nodePath.length ||
          !nibbleArraysEqual(nodePath, remainingPath.slice(0, nodePath.length))
        ) {
          return matcher.onKeyMissing("extension path mismatch", errors);
        }

        pathOffset += nodePath.length;

        const child = node[1];
        const childBytes = rlpItemToBytes(child);
        if (childBytes.length === 32) {
          currentHash = bytesToHex(childBytes) as Hex;
        } else {
          nextNode = decodeInlineChild(child);
        }
      }
    } else {
      errors.push(`Invalid trie node: expected 2 or 17 items, got ${node.length}`);
      return { valid: false, errors };
    }
  }

  errors.push("Proof exhausted before reaching leaf");
  return { valid: false, errors };
}

// ── MPT proof verification (public API) ──────────────────────────────

/**
 * Verify a Merkle Patricia Trie inclusion proof for a storage slot.
 *
 * The key is keccak256-hashed for the trie path. Zero-valued slots
 * with empty proofs are accepted only when the trie root equals the
 * empty trie root (prevents empty-proof bypass attacks).
 */
export function verifyMptProof(
  rootHash: Hex,
  rawKey: Hex,
  expectedValue: Hex,
  proof: Hex[]
): ProofVerificationResult {
  if (proof.length === 0) {
    // An empty proof is only valid for a zero value when the trie is
    // completely empty (rootHash equals the empty trie root).  A non-empty
    // trie always provides proof nodes, even for absent keys (proof of
    // non-inclusion).  Without this check an attacker could supply
    // proof:[] to falsely claim any slot is zero.
    const EMPTY_TRIE_ROOT: Hex =
      "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421";
    if (isZeroValue(expectedValue) && rootHash.toLowerCase() === EMPTY_TRIE_ROOT) {
      return { valid: true, errors: [] };
    }
    const msg = isZeroValue(expectedValue)
      ? "Empty proof for zero value but storage trie is non-empty, proof of non-inclusion required"
      : "Empty proof but expected non-zero value";
    return { valid: false, errors: [msg] };
  }

  const canonicalKey = normalizeStorageSlotKey(rawKey);
  const keyHash = keccak256(canonicalKey);
  const pathNibbles = bytesToNibbles(hexToBytes(keyHash));
  return walkMptProof(rootHash, pathNibbles, proof, storageMatcher(expectedValue));
}

function verifyValue(
  provenValue: Hex,
  expectedValue: Hex,
  errors: string[]
): ProofVerificationResult {
  // The proven value is RLP-encoded in the trie. Decode it once.
  let decodedValue: Hex;
  try {
    const decoded = fromRlp(provenValue, "hex");
    decodedValue = (typeof decoded === "string" ? decoded : provenValue) as Hex;
  } catch {
    decodedValue = provenValue;
  }

  const normalizedProven = normalizeStorageValue(decodedValue);
  const normalizedExpected = normalizeStorageValue(expectedValue);

  if (normalizedProven !== normalizedExpected) {
    errors.push(`Value mismatch: proven ${normalizedProven}, expected ${normalizedExpected}`);
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Normalize a storage value to a standard form for comparison.
 * Storage values are left-padded to 32 bytes.
 */
function normalizeStorageValue(value: Hex): Hex {
  if (value === "0x" || value === "0x0" || value === "0x00") {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  const stripped = value.replace(/^0x0*/, "0x");
  if (stripped === "0x") {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  const hexDigits = stripped.slice(2);
  return `0x${hexDigits.padStart(64, "0")}` as Hex;
}

// ── Account proof verification ─────────────────────────────────────

/**
 * Verify an account proof against a state root.
 *
 * The account trie key is keccak256(address).
 * The account value is RLP([nonce, balance, storageHash, codeHash]).
 */
export function verifyAccountProof(
  stateRoot: Hex,
  account: AccountProofInput
): ProofVerificationResult {
  const expectedAccountRlp = toRlp([
    account.nonce === 0 ? "0x" : toHex(account.nonce),
    account.balance === "0" ? "0x" : toHex(BigInt(account.balance)),
    account.storageHash,
    account.codeHash,
  ]) as Hex;

  const addressHex = account.address.toLowerCase() as Hex;

  if (account.accountProof.length === 0) {
    return { valid: false, errors: ["Empty account proof"] };
  }

  const pathNibbles = bytesToNibbles(hexToBytes(keccak256(addressHex)));
  return walkMptProof(stateRoot, pathNibbles, account.accountProof, accountMatcher(expectedAccountRlp));
}

/**
 * Verify a storage proof against a storage root.
 */
export function verifyStorageProof(
  storageRoot: Hex,
  storageProof: StorageProofInput
): ProofVerificationResult {
  return verifyMptProof(
    storageRoot,
    storageProof.key,
    storageProof.value,
    storageProof.proof
  );
}
