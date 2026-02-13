/**
 * Safe transaction warning system
 *
 * Inspired by safe-tx-hashes-util's comprehensive warning system
 * Warns about dangerous operations that could compromise the Safe
 */

import type { Hex } from "viem";

export type WarningLevel = "info" | "warning" | "critical";

export interface TransactionWarning {
  level: WarningLevel;
  title: string;
  description: string;
  /** Additional context for the warning */
  context?: Record<string, string>;
}

/**
 * Known Safe contract addresses (for detecting self-calls)
 * Add more as needed
 */
const KNOWN_SAFE_IMPLEMENTATIONS = new Set([
  // Safe Singleton L1 1.3.0
  "0xd9db270c1b5e3bd161e8c8503c55ceabee709552",
  // Safe Singleton L2 1.3.0
  "0x3e5c63644e683549055b9be8653de26e0b4cd36e",
  // Safe Singleton 1.4.1
  "0x41675c099f32341bf84bfc5382af534df5c7461a",
]);

/**
 * Known Safe modules and contracts
 */
const KNOWN_SAFE_CONTRACTS = new Set([
  // Safe Proxy Factory
  "0xa6b71e26c5e0845f74c812102ca7114b6a896ab2",
  // Compatibility Fallback Handler
  "0xf48f2b2d2a534e402487b3ee7c18c33aec0fe5e4",
  // MultiSend
  "0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761",
  // MultiSendCallOnly
  "0x40a2accbd92bca938b02010e17a5b8929b49130d",
]);

/**
 * Known DeFi protocols and common contracts
 */
const KNOWN_PROTOCOLS: Record<string, string> = {
  // Uniswap
  "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 Router",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 Router 2",
  // CoW Swap
  "0xc92e8bdf79f0507f65a392b0ab4667716bfe0110": "CoW Swap GPv2Settlement",
  // Lido
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": "Lido stETH",
  // Add more as needed
};

/**
 * Analyze a Safe transaction for potential security warnings
 */
export function analyzeTransaction(params: {
  safeAddress: Hex;
  to: Hex;
  value: bigint;
  data: Hex;
  operation: 0 | 1; // 0 = Call, 1 = DelegateCall
  decodedMethod?: string;
}): TransactionWarning[] {
  const warnings: TransactionWarning[] = [];
  const { safeAddress, to, value, data, operation, decodedMethod } = params;

  // CRITICAL: DelegateCall operations
  if (operation === 1) {
    warnings.push({
      level: "critical",
      title: "DELEGATECALL Operation",
      description:
        "This transaction uses DELEGATECALL, which executes code from another contract in the Safe's context. " +
        "The target contract can modify the Safe's storage, change owners, drain funds, or take complete control. " +
        "Only approve if you fully trust the target contract and understand what it does.",
      context: {
        targetContract: to,
        targetName: KNOWN_PROTOCOLS[to.toLowerCase()] || "Unknown Contract",
      },
    });
  }

  // CRITICAL: Self-call to Safe (policy changes)
  const isSelfCall = to.toLowerCase() === safeAddress.toLowerCase();
  if (isSelfCall && operation === 0) {
    // This is already handled by the Safe policy interpreter, but we add context
    if (decodedMethod && ["changeThreshold", "addOwnerWithThreshold", "removeOwner", "swapOwner"].includes(decodedMethod)) {
      warnings.push({
        level: "critical",
        title: "Safe Configuration Change",
        description:
          "This transaction modifies the Safe's signing policy (owners or threshold). " +
          "Incorrect changes can lock you out of the Safe or allow unauthorized access. " +
          "Verify all addresses and threshold values carefully.",
        context: {
          method: decodedMethod,
        },
      });
    }
  }

  // WARNING: Unknown contract interaction
  const isKnownContract =
    KNOWN_SAFE_CONTRACTS.has(to.toLowerCase()) ||
    KNOWN_SAFE_IMPLEMENTATIONS.has(to.toLowerCase()) ||
    to.toLowerCase() in KNOWN_PROTOCOLS;

  if (!isKnownContract && !isSelfCall && data !== "0x" && data.length > 2) {
    warnings.push({
      level: "warning",
      title: "Unknown Contract Interaction",
      description:
        "This transaction interacts with a contract that is not in SafeLens's database of known protocols. " +
        "Verify the contract address independently before approving. " +
        "Malicious contracts can steal funds or compromise your Safe.",
      context: {
        contract: to,
        hasData: data.length > 2 ? "yes" : "no",
      },
    });
  }

  // WARNING: Large value transfer
  const largeValueThreshold = 10n ** 18n * 10n; // 10 ETH
  if (value > largeValueThreshold) {
    warnings.push({
      level: "warning",
      title: "Large Value Transfer",
      description: `This transaction transfers ${(Number(value) / 1e18).toFixed(4)} ETH. Verify the recipient address carefully.`,
      context: {
        recipient: to,
        value: `${(Number(value) / 1e18).toFixed(4)} ETH`,
      },
    });
  }

  // INFO: Known protocol interaction
  if (isKnownContract && !isSelfCall) {
    const protocolName = KNOWN_PROTOCOLS[to.toLowerCase()];
    if (protocolName) {
      warnings.push({
        level: "info",
        title: `Interacting with ${protocolName}`,
        description: `This transaction interacts with ${protocolName}, a known protocol.`,
        context: {
          protocol: protocolName,
          contract: to,
        },
      });
    }
  }

  return warnings;
}

/**
 * Get the highest warning level from a list of warnings
 */
export function getHighestWarningLevel(warnings: TransactionWarning[]): WarningLevel {
  if (warnings.some((w) => w.level === "critical")) return "critical";
  if (warnings.some((w) => w.level === "warning")) return "warning";
  return "info";
}
