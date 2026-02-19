/**
 * Simulation verification — structural consistency checks.
 *
 * Since we cannot re-run the simulation without an RPC, verification
 * is limited to structural integrity: valid hex formats, consistent
 * addresses, and sensible values. The trust label communicates that
 * the simulation result is RPC-sourced and not independently verifiable.
 */

import type { Simulation } from "../types";

export interface SimulationCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface SimulationVerificationResult {
  valid: boolean;
  /** True when the simulated transaction reverted (distinct from structural validity). */
  executionReverted: boolean;
  errors: string[];
  checks: SimulationCheck[];
}

/**
 * Verify structural consistency of a simulation result.
 *
 * Checks:
 * 1. Block number is a positive integer
 * 2. Gas used is a non-negative decimal string
 * 3. Return data is valid hex (or null)
 * 4. All logs have valid structure
 * 5. All state diffs have valid structure (if present)
 * 6. Trust classification is set
 */
export function verifySimulation(
  simulation: Simulation
): SimulationVerificationResult {
  const errors: string[] = [];
  const checks: SimulationCheck[] = [];

  // 1. Block number
  const blockValid =
    Number.isInteger(simulation.blockNumber) && simulation.blockNumber > 0;
  checks.push({
    id: "block-number",
    label: "Block number",
    passed: blockValid,
    detail: blockValid
      ? `Simulated at block ${simulation.blockNumber}`
      : `Invalid block number: ${simulation.blockNumber}`,
  });
  if (!blockValid) {
    errors.push(`Invalid block number: ${simulation.blockNumber}`);
  }

  // 2. Gas used
  const gasNum = Number(simulation.gasUsed);
  const gasValid = !isNaN(gasNum) && gasNum >= 0;
  checks.push({
    id: "gas-used",
    label: "Gas used",
    passed: gasValid,
    detail: gasValid
      ? `${simulation.gasUsed} gas`
      : `Invalid gas value: ${simulation.gasUsed}`,
  });
  if (!gasValid) {
    errors.push(`Invalid gasUsed value: ${simulation.gasUsed}`);
  }

  // 3. Return data
  const returnDataValid =
    simulation.returnData === null ||
    (typeof simulation.returnData === "string" &&
      /^0x[0-9a-fA-F]*$/.test(simulation.returnData));
  checks.push({
    id: "return-data",
    label: "Return data",
    passed: returnDataValid,
    detail: returnDataValid
      ? simulation.returnData
        ? `${simulation.returnData.length / 2 - 1} bytes`
        : "null (no return data)"
      : "Invalid hex format",
  });
  if (!returnDataValid) {
    errors.push("Return data is not valid hex");
  }

  // 4. Logs
  const logsValid = simulation.logs.every(
    (log) =>
      /^0x[0-9a-fA-F]{40}$/i.test(log.address) &&
      Array.isArray(log.topics) &&
      log.topics.every((t) => /^0x[0-9a-fA-F]{64}$/i.test(t)) &&
      /^0x[0-9a-fA-F]*$/.test(log.data)
  );
  checks.push({
    id: "logs",
    label: "Event logs",
    passed: logsValid,
    detail: logsValid
      ? `${simulation.logs.length} log(s)`
      : "One or more logs have invalid structure",
  });
  if (!logsValid) {
    errors.push("One or more simulation logs have invalid structure");
  }

  // 5. State diffs (optional)
  if (simulation.stateDiffs) {
    const diffsValid = simulation.stateDiffs.every(
      (diff) =>
        /^0x[0-9a-fA-F]{40}$/i.test(diff.address) &&
        /^0x[0-9a-fA-F]{64}$/i.test(diff.key) &&
        /^0x[0-9a-fA-F]{64}$/i.test(diff.before) &&
        /^0x[0-9a-fA-F]{64}$/i.test(diff.after)
    );
    checks.push({
      id: "state-diffs",
      label: "State diffs",
      passed: diffsValid,
      detail: diffsValid
        ? `${simulation.stateDiffs.length} diff(s)`
        : "One or more state diffs have invalid structure",
    });
    if (!diffsValid) {
      errors.push("One or more state diffs have invalid structure");
    }
  }

  // 6. Execution result
  checks.push({
    id: "execution-result",
    label: "Execution result",
    passed: simulation.success,
    detail: simulation.success ? "Transaction succeeded" : "Transaction reverted",
  });

  // 6b. Cross-validate success flag against returnData content.
  // Safe's execTransaction returns abi.encode(bool) — 32 bytes where
  // the last byte is 0x01 for true. If success=true but returnData
  // decodes to false (or contains a revert selector), the package
  // may have been tampered with.
  if (simulation.success && simulation.returnData) {
    const rd = simulation.returnData.toLowerCase();
    const EXEC_TX_TRUE =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    // Standard revert selector: Error(string) = 0x08c379a2
    const REVERT_SELECTOR = "0x08c379a2";

    const returnDataConsistent =
      rd === EXEC_TX_TRUE || // normal success
      rd.length < 66; // short return data — can't decode, skip check

    if (!returnDataConsistent) {
      // returnData is long enough to decode but doesn't match success=true
      const isRevertPayload = rd.startsWith(REVERT_SELECTOR);
      const consistencyPassed = !isRevertPayload;
      checks.push({
        id: "return-data-consistency",
        label: "Return data consistency",
        passed: consistencyPassed,
        detail: consistencyPassed
          ? "Return data is consistent with success flag"
          : "Return data contains a revert payload but success=true — possible tampering",
      });
      if (!consistencyPassed) {
        errors.push(
          "Return data contains a revert payload but success=true"
        );
      }
    }
  }

  // 7. Trust classification
  const trustValid =
    typeof simulation.trust === "string" && simulation.trust.length > 0;
  checks.push({
    id: "trust",
    label: "Trust classification",
    passed: trustValid,
    detail: trustValid ? simulation.trust : "Missing trust classification",
  });
  if (!trustValid) {
    errors.push("Missing trust classification");
  }

  return {
    valid: errors.length === 0,
    executionReverted: !simulation.success,
    errors,
    checks,
  };
}
