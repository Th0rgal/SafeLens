/**
 * Merkle Patricia Trie proof verification.
 *
 * Verifies eth_getProof storage proofs and account proofs against a
 * state root, using only RLP decoding and keccak256 — no external
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
  // Nested list — encode it back to RLP to get the bytes
  return hexToBytes(toRlp(item as any) as Hex);
}

function rlpItemToHex(item: RlpItem): Hex {
  if (typeof item === "string") {
    return item as Hex;
  }
  return toRlp(item as any) as Hex;
}

// ── MPT proof verification ─────────────────────────────────────────

/**
 * Verify a Merkle Patricia Trie inclusion proof.
 *
 * Given:
 *   - rootHash: the expected trie root
 *   - path: the key being proven (will be keccak256-hashed for the trie path)
 *   - expectedValue: the RLP-encoded value at that key (or "0x" for zero/empty)
 *   - proof: array of RLP-encoded trie nodes
 *
 * Returns verification result with errors if invalid.
 */
export function verifyMptProof(
  rootHash: Hex,
  rawKey: Hex,
  expectedValue: Hex,
  proof: Hex[]
): ProofVerificationResult {
  const errors: string[] = [];

  if (proof.length === 0) {
    // Empty proof means the value should be the default (zero)
    if (
      expectedValue === "0x" ||
      expectedValue ===
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      return { valid: true, errors: [] };
    }
    errors.push("Empty proof but expected non-zero value");
    return { valid: false, errors };
  }

  // Compute the trie path as nibbles of keccak256(key)
  const keyHash = keccak256(rawKey);
  const pathNibbles = bytesToNibbles(hexToBytes(keyHash));
  let pathOffset = 0;

  // Walk the proof nodes
  let currentHash = rootHash;

  for (let i = 0; i < proof.length; i++) {
    const nodeRlp = proof[i];

    // Verify this node hashes to the expected hash
    const nodeHash = keccak256(nodeRlp);
    // For the root node, or if the node is >= 32 bytes, it should be referenced by hash
    // Short nodes (< 32 bytes RLP) can be inlined, but for proof arrays they should match
    if (i === 0) {
      if (nodeHash !== rootHash) {
        errors.push(
          `Root node hash mismatch: expected ${rootHash}, got ${nodeHash}`
        );
        return { valid: false, errors };
      }
    } else if (nodeHash !== currentHash) {
      // This handles the case where a node is referenced by hash
      errors.push(
        `Node ${i} hash mismatch: expected ${currentHash}, got ${nodeHash}`
      );
      return { valid: false, errors };
    }

    const node = rlpDecodeNode(nodeRlp);

    if (node.length === 17) {
      // Branch node: 16 children + value
      if (pathOffset >= pathNibbles.length) {
        // We've consumed all path nibbles — the value is in the branch node itself
        const value = rlpItemToHex(node[16]);
        return verifyValue(value, expectedValue, errors);
      }

      const nibble = pathNibbles[pathOffset];
      pathOffset += 1;

      const child = node[nibble];
      const childHex = rlpItemToHex(child);

      if (childHex === "0x" || childHex === "0x80") {
        // Empty child — key doesn't exist in trie
        if (
          expectedValue === "0x" ||
          expectedValue ===
            "0x0000000000000000000000000000000000000000000000000000000000000000"
        ) {
          return { valid: true, errors: [] };
        }
        errors.push("Path leads to empty branch but expected non-zero value");
        return { valid: false, errors };
      }

      // If the child is a hash (32 bytes), follow it to the next proof node
      const childBytes = rlpItemToBytes(child);
      if (childBytes.length === 32) {
        currentHash = bytesToHex(childBytes) as Hex;
      } else {
        // Inlined node — shouldn't happen in a proof array, but handle it
        errors.push("Unexpected inlined node in branch");
        return { valid: false, errors };
      }
    } else if (node.length === 2) {
      // Extension or leaf node
      const encodedPath = rlpItemToBytes(node[0]);
      const [nodePath, isLeaf] = decodeHpPath(encodedPath);

      // Verify path prefix matches
      const remainingPath = pathNibbles.slice(pathOffset);
      if (isLeaf) {
        // Leaf node: rest of path must match exactly
        if (!nibbleArraysEqual(nodePath, remainingPath)) {
          // Path doesn't match — key doesn't exist
          if (
            expectedValue === "0x" ||
            expectedValue ===
              "0x0000000000000000000000000000000000000000000000000000000000000000"
          ) {
            return { valid: true, errors: [] };
          }
          errors.push("Leaf path mismatch — key not found in trie");
          return { valid: false, errors };
        }

        // Value is node[1]
        const value = rlpItemToHex(node[1]);
        return verifyValue(value, expectedValue, errors);
      } else {
        // Extension node: path prefix must match
        if (
          remainingPath.length < nodePath.length ||
          !nibbleArraysEqual(
            nodePath,
            remainingPath.slice(0, nodePath.length)
          )
        ) {
          // Path diverges
          if (
            expectedValue === "0x" ||
            expectedValue ===
              "0x0000000000000000000000000000000000000000000000000000000000000000"
          ) {
            return { valid: true, errors: [] };
          }
          errors.push("Extension path mismatch — key not found in trie");
          return { valid: false, errors };
        }

        pathOffset += nodePath.length;

        // Follow the child reference
        const child = node[1];
        const childBytes = rlpItemToBytes(child);
        if (childBytes.length === 32) {
          currentHash = bytesToHex(childBytes) as Hex;
        } else {
          errors.push("Unexpected inlined node in extension");
          return { valid: false, errors };
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

function nibbleArraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function verifyValue(
  provenValue: Hex,
  expectedValue: Hex,
  errors: string[]
): ProofVerificationResult {
  // Normalize: RLP-decoded value for storage slots
  // The proven value is RLP-encoded in the trie. For storage,
  // the value is RLP(value). So we need to compare the RLP-decoded
  // proven value against the expected value.
  let decodedValue: Hex;
  try {
    const decoded = fromRlp(provenValue, "hex");
    decodedValue = (typeof decoded === "string" ? decoded : provenValue) as Hex;
  } catch {
    decodedValue = provenValue;
  }

  // Normalize both to compare
  const normalizedProven = normalizeStorageValue(decodedValue);
  const normalizedExpected = normalizeStorageValue(expectedValue);

  if (normalizedProven !== normalizedExpected) {
    errors.push(
      `Value mismatch: proven ${normalizedProven}, expected ${normalizedExpected}`
    );
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

  // Remove leading zeros for comparison, then pad back to 32 bytes
  const stripped = value.replace(/^0x0*/, "0x");
  if (stripped === "0x") {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  // Pad to 64 hex chars (32 bytes)
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
  // Build the expected RLP-encoded account value
  const expectedAccountRlp = toRlp([
    account.nonce === 0 ? "0x" : toHex(account.nonce),
    account.balance === "0" ? "0x" : toHex(BigInt(account.balance)),
    account.storageHash,
    account.codeHash,
  ]) as Hex;

  // The account trie uses keccak256(address) as the key, but the proof
  // already traverses this path. We pass the raw address and let
  // verifyMptProof hash it.
  const addressHex = account.address.toLowerCase() as Hex;

  // For the account trie, the key is the address (hashed by verifyMptProof)
  // and the expected value is the RLP-encoded account
  return verifyMptProofRaw(
    stateRoot,
    keccak256(addressHex),
    expectedAccountRlp,
    account.accountProof
  );
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

/**
 * Like verifyMptProof but takes a pre-hashed key path.
 * Used for account proofs where the path is keccak256(address).
 */
function verifyMptProofRaw(
  rootHash: Hex,
  keyHash: Hex,
  expectedRlpValue: Hex,
  proof: Hex[]
): ProofVerificationResult {
  const errors: string[] = [];

  if (proof.length === 0) {
    errors.push("Empty account proof");
    return { valid: false, errors };
  }

  const pathNibbles = bytesToNibbles(hexToBytes(keyHash));
  let pathOffset = 0;
  let currentHash = rootHash;

  for (let i = 0; i < proof.length; i++) {
    const nodeRlp = proof[i];
    const nodeHash = keccak256(nodeRlp);

    if (i === 0) {
      if (nodeHash !== rootHash) {
        errors.push(
          `Root node hash mismatch: expected ${rootHash}, got ${nodeHash}`
        );
        return { valid: false, errors };
      }
    } else if (nodeHash !== currentHash) {
      errors.push(
        `Node ${i} hash mismatch: expected ${currentHash}, got ${nodeHash}`
      );
      return { valid: false, errors };
    }

    const node = rlpDecodeNode(nodeRlp);

    if (node.length === 17) {
      if (pathOffset >= pathNibbles.length) {
        const value = rlpItemToHex(node[16]);
        if (value === expectedRlpValue) {
          return { valid: true, errors: [] };
        }
        errors.push("Account value mismatch at branch terminus");
        return { valid: false, errors };
      }

      const nibble = pathNibbles[pathOffset];
      pathOffset += 1;

      const child = node[nibble];
      const childHex = rlpItemToHex(child);

      if (childHex === "0x" || childHex === "0x80") {
        errors.push("Account not found in state trie");
        return { valid: false, errors };
      }

      const childBytes = rlpItemToBytes(child);
      if (childBytes.length === 32) {
        currentHash = bytesToHex(childBytes) as Hex;
      } else {
        errors.push("Unexpected inlined node in branch");
        return { valid: false, errors };
      }
    } else if (node.length === 2) {
      const encodedPath = rlpItemToBytes(node[0]);
      const [nodePath, isLeaf] = decodeHpPath(encodedPath);

      const remainingPath = pathNibbles.slice(pathOffset);

      if (isLeaf) {
        if (!nibbleArraysEqual(nodePath, remainingPath)) {
          errors.push("Account leaf path mismatch");
          return { valid: false, errors };
        }

        const value = rlpItemToHex(node[1]);
        if (value === expectedRlpValue) {
          return { valid: true, errors: [] };
        }
        errors.push("Account value mismatch at leaf");
        return { valid: false, errors };
      } else {
        if (
          remainingPath.length < nodePath.length ||
          !nibbleArraysEqual(
            nodePath,
            remainingPath.slice(0, nodePath.length)
          )
        ) {
          errors.push("Account extension path mismatch");
          return { valid: false, errors };
        }

        pathOffset += nodePath.length;

        const child = node[1];
        const childBytes = rlpItemToBytes(child);
        if (childBytes.length === 32) {
          currentHash = bytesToHex(childBytes) as Hex;
        } else {
          errors.push("Unexpected inlined node in extension");
          return { valid: false, errors };
        }
      }
    } else {
      errors.push(
        `Invalid trie node: expected 2 or 17 items, got ${node.length}`
      );
      return { valid: false, errors };
    }
  }

  errors.push("Account proof exhausted before reaching leaf");
  return { valid: false, errors };
}
