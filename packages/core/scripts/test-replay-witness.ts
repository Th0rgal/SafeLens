/**
 * Generate a replay input JSON for the Gnosis Chain transaction,
 * then verify it can be deserialized by checking key fields.
 *
 * Usage:
 *   bun run scripts/test-replay-witness.ts
 *
 * To feed into Rust e2e test:
 *   SAFELENS_E2E_REPLAY_INPUT=/tmp/replay-input.json cargo test e2e_replay -- --ignored
 */

import { createPublicClient, http, pad, toHex, type Address, type Hex } from "viem";
import { gnosis } from "viem/chains";
import { fetchSimulation, fetchSimulationWitness } from "../src/lib/simulation/fetcher";
import { slotToKey, SLOT_SINGLETON } from "../src/lib/proof/safe-layout";
import { writeFileSync } from "node:fs";

const SAFE_ADDRESS = "0xba260842B007FaB4119C9747D709119DE4257276" as Address;
const CHAIN_ID = 100;
const RPC_URL = "https://rpc.gnosischain.com";

const transaction = {
  to: "0x5bb21B30E912871D27182E7b7F9C37C888269cb2",
  value: "1000000000000000000",
  data: null,
  operation: 0 as const,
  nonce: 1,
  safeTxGas: "0",
  baseGas: "0",
  gasPrice: "0",
  gasToken: "0x0000000000000000000000000000000000000000",
  refundReceiver: "0x0000000000000000000000000000000000000000",
};

async function main() {
  console.log("Fetching simulation...");
  const simulation = await fetchSimulation(SAFE_ADDRESS, CHAIN_ID, transaction, {
    rpcUrl: RPC_URL,
  });
  console.log(`  success=${simulation.success} returnData=${simulation.returnData} gasUsed=${simulation.gasUsed}`);
  console.log(`  blockNumber=${simulation.blockNumber} traceAvailable=${simulation.traceAvailable}`);

  console.log("\nFetching simulation witness...");
  const witness = await fetchSimulationWitness(
    SAFE_ADDRESS,
    CHAIN_ID,
    transaction,
    simulation,
    { rpcUrl: RPC_URL }
  );

  // Verify the fix: check that slot 0 and the singleton are present
  const safeAccount = witness.replayAccounts?.find(
    (a) => a.address.toLowerCase() === SAFE_ADDRESS.toLowerCase()
  );

  const slot0Key = slotToKey(SLOT_SINGLETON);
  const slot0Value = safeAccount?.storage[slot0Key];
  console.log(`\n  Safe replay account found: ${!!safeAccount}`);
  console.log(`  Slot 0 (singleton) present: ${!!slot0Value}`);
  console.log(`  Slot 0 value: ${slot0Value}`);

  if (slot0Value) {
    const singletonAddr = ("0x" + slot0Value.slice(26)).toLowerCase();
    console.log(`  Singleton address: ${singletonAddr}`);

    const hasSingleton = witness.replayAccounts?.some(
      (a) => a.address.toLowerCase() === singletonAddr
    );
    console.log(`  Singleton in replay accounts: ${hasSingleton}`);

    if (hasSingleton) {
      const singletonAccount = witness.replayAccounts?.find(
        (a) => a.address.toLowerCase() === singletonAddr
      );
      console.log(`  Singleton code length: ${singletonAccount?.code.length ?? 0} chars`);
    }
  }

  console.log(`\n  Total replay accounts: ${witness.replayAccounts?.length ?? 0}`);
  for (const account of witness.replayAccounts ?? []) {
    const storageCount = Object.keys(account.storage).length;
    console.log(`    ${account.address}: code=${account.code.length > 4 ? "yes" : "no"} storage=${storageCount} slots`);
  }

  // Build the replay input JSON for the Rust e2e test
  const replayInput = {
    chainId: CHAIN_ID,
    safeAddress: SAFE_ADDRESS,
    transaction: {
      to: transaction.to,
      value: transaction.value,
      data: transaction.data ?? "0x",
      operation: transaction.operation,
      safeTxGas: transaction.safeTxGas,
    },
    simulation: {
      success: simulation.success,
      returnData: simulation.returnData,
      gasUsed: simulation.gasUsed,
      blockNumber: simulation.blockNumber,
      logs: simulation.logs,
    },
    simulationWitness: {
      replayBlock: witness.replayBlock,
      replayAccounts: witness.replayAccounts,
      replayCaller: witness.replayCaller,
      replayGasLimit: witness.replayGasLimit,
      replayCalldata: witness.replayCalldata,
      witnessOnly: true,
    },
  };

  const outPath = "/tmp/safelens-replay-input.json";
  writeFileSync(outPath, JSON.stringify(replayInput, null, 2));
  console.log(`\nWrote replay input to ${outPath}`);
  console.log("Run Rust e2e test with:");
  console.log(`  cd apps/desktop/src-tauri && SAFELENS_E2E_REPLAY_INPUT=${outPath} cargo test e2e_replay -- --ignored --nocapture`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
