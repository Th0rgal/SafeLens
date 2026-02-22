use revm::{
    context::{result::ExecutionResult, Context, TxEnv},
    database::CacheDB,
    database_interface::EmptyDB,
    handler::{ExecuteEvm, MainBuilder, MainContext},
    primitives::{Address, Bytes, Log, TxKind, B256, U256},
    state::{AccountInfo, Bytecode},
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, str::FromStr};

const REASON_REPLAY_NOT_RUN: &str = "simulation-replay-not-run";
const REASON_REPLAY_EXEC_ERROR: &str = "simulation-replay-exec-error";
const REASON_REPLAY_MISMATCH_SUCCESS: &str = "simulation-replay-mismatch-success";
const REASON_REPLAY_MISMATCH_RETURN_DATA: &str = "simulation-replay-mismatch-return-data";
const REASON_REPLAY_MISMATCH_LOGS: &str = "simulation-replay-mismatch-logs";
const REASON_REPLAY_MISMATCH_GAS: &str = "simulation-replay-mismatch-gas";
const REASON_WITNESS_INCOMPLETE: &str = "simulation-witness-incomplete";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationReplayInput {
    pub chain_id: u64,
    pub safe_address: String,
    pub transaction: ReplayTransaction,
    pub simulation: ReplaySimulation,
    pub simulation_witness: ReplayWitness,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayTransaction {
    pub to: String,
    pub value: String,
    pub data: Option<String>,
    pub safe_tx_gas: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaySimulation {
    pub success: bool,
    pub return_data: Option<String>,
    pub gas_used: String,
    #[serde(default)]
    pub logs: Vec<ReplaySimulationLog>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplaySimulationLog {
    pub address: String,
    #[serde(default)]
    pub topics: Vec<String>,
    pub data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayWitness {
    pub replay_accounts: Option<Vec<ReplayWitnessAccount>>,
    pub replay_caller: Option<String>,
    pub replay_gas_limit: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayWitnessAccount {
    pub address: String,
    pub balance: String,
    pub nonce: u64,
    pub code: String,
    #[serde(default)]
    pub storage: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SimulationReplayVerificationResult {
    pub executed: bool,
    pub success: bool,
    pub reason: String,
    pub error: Option<String>,
}

#[derive(Debug)]
struct ReplayExecution {
    success: bool,
    return_data: String,
    gas_used: u64,
    logs: Vec<ReplaySimulationLog>,
}

pub fn verify_simulation_replay(
    input: SimulationReplayInput,
) -> SimulationReplayVerificationResult {
    let Some(accounts) = input.simulation_witness.replay_accounts.as_ref() else {
        return SimulationReplayVerificationResult {
            executed: false,
            success: false,
            reason: REASON_WITNESS_INCOMPLETE.to_string(),
            error: Some(
                "simulationWitness.replayAccounts is missing; witness is incomplete for local replay."
                    .to_string(),
            ),
        };
    };

    let replay = match execute_replay(&input, accounts) {
        Ok(value) => value,
        Err(error) => {
            return SimulationReplayVerificationResult {
                executed: true,
                success: false,
                reason: REASON_REPLAY_EXEC_ERROR.to_string(),
                error: Some(error),
            };
        }
    };

    let expected_return_data =
        normalize_hex(input.simulation.return_data.as_deref().unwrap_or("0x"));
    if replay.success != input.simulation.success {
        return SimulationReplayVerificationResult {
            executed: true,
            success: false,
            reason: REASON_REPLAY_MISMATCH_SUCCESS.to_string(),
            error: Some(format!(
                "Replay success mismatch: replay={}, simulation={}",
                replay.success, input.simulation.success
            )),
        };
    }

    if replay.return_data != expected_return_data {
        return SimulationReplayVerificationResult {
            executed: true,
            success: false,
            reason: REASON_REPLAY_MISMATCH_RETURN_DATA.to_string(),
            error: Some(format!(
                "Replay returnData mismatch: replay={}, simulation={}",
                replay.return_data, expected_return_data
            )),
        };
    }

    let expected_logs = normalize_simulation_logs(&input.simulation.logs);
    let replay_logs = normalize_simulation_logs(&replay.logs);
    if replay_logs != expected_logs {
        return SimulationReplayVerificationResult {
            executed: true,
            success: false,
            reason: REASON_REPLAY_MISMATCH_LOGS.to_string(),
            error: Some("Replay logs mismatch against packaged simulation logs.".to_string()),
        };
    }

    let expected_gas_used = match parse_u256(&input.simulation.gas_used) {
        Ok(v) => v,
        Err(err) => {
            return SimulationReplayVerificationResult {
                executed: true,
                success: false,
                reason: REASON_REPLAY_EXEC_ERROR.to_string(),
                error: Some(format!("Invalid simulation.gasUsed: {err}")),
            };
        }
    };

    if U256::from(replay.gas_used) > expected_gas_used {
        return SimulationReplayVerificationResult {
            executed: true,
            success: false,
            reason: REASON_REPLAY_MISMATCH_GAS.to_string(),
            error: Some(format!(
                "Replay gas policy mismatch: replayGas={} exceeds simulationGas={}",
                replay.gas_used, expected_gas_used
            )),
        };
    }

    SimulationReplayVerificationResult {
        executed: true,
        success: true,
        reason: REASON_REPLAY_NOT_RUN.to_string(),
        error: None,
    }
}

fn execute_replay(
    input: &SimulationReplayInput,
    accounts: &[ReplayWitnessAccount],
) -> Result<ReplayExecution, String> {
    let mut db = CacheDB::new(EmptyDB::default());

    for account in accounts {
        let address = parse_address(&account.address, "replay account address")?;
        let balance = parse_u256(&account.balance)
            .map_err(|err| format!("invalid replay account balance for {address:#x}: {err}"))?;
        let code = parse_bytes(&account.code)
            .map_err(|err| format!("invalid replay account code for {address:#x}: {err}"))?;

        db.insert_account_info(
            address,
            AccountInfo::new(balance, account.nonce, B256::ZERO, Bytecode::new_raw(code)),
        );

        for (slot, value) in &account.storage {
            let slot_key = parse_u256(slot)
                .map_err(|err| format!("invalid storage key for {address:#x}: {err}"))?;
            let slot_value = parse_u256(value)
                .map_err(|err| format!("invalid storage value for {address:#x}: {err}"))?;
            db.insert_account_storage(address, slot_key.into(), slot_value)
                .map_err(|err| format!("failed to seed storage for {address:#x}: {err}"))?;
        }
    }

    let caller = match input.simulation_witness.replay_caller.as_deref() {
        Some(raw) => parse_address(raw, "simulationWitness.replayCaller")?,
        None => parse_address(&input.safe_address, "safeAddress")?,
    };

    let to = parse_address(&input.transaction.to, "transaction.to")?;
    let value = parse_u256(&input.transaction.value)
        .map_err(|err| format!("invalid transaction.value: {err}"))?;

    let data = match input.transaction.data.as_deref() {
        Some(raw) => parse_bytes(raw).map_err(|err| format!("invalid transaction.data: {err}"))?,
        None => Bytes::new(),
    };

    let gas_limit = match input.simulation_witness.replay_gas_limit {
        Some(limit) => limit,
        None => match input.transaction.safe_tx_gas.as_deref() {
            Some(raw) => {
                let parsed = parse_u256(raw)
                    .map_err(|err| format!("invalid transaction.safeTxGas: {err}"))?;
                let capped = parsed.min(U256::from(u64::MAX));
                let as_u64 = capped.to::<u64>();
                if as_u64 == 0 {
                    3_000_000
                } else {
                    as_u64
                }
            }
            None => 3_000_000,
        },
    };

    let tx = TxEnv::builder()
        .caller(caller)
        .kind(TxKind::Call(to))
        .gas_limit(gas_limit)
        .chain_id(Some(input.chain_id))
        .value(value)
        .data(data)
        .build()
        .map_err(|err| format!("failed to build replay tx: {err:?}"))?;

    let ctx = Context::mainnet().with_db(db);
    let mut evm = ctx.build_mainnet();
    let replay = evm
        .transact(tx)
        .map_err(|err| format!("local replay transaction failed: {err}"))?
        .result;

    Ok(extract_execution(replay))
}

fn extract_execution(result: ExecutionResult) -> ReplayExecution {
    match result {
        ExecutionResult::Success {
            gas_used,
            output,
            logs,
            ..
        } => ReplayExecution {
            success: true,
            return_data: to_hex_prefixed(output.into_data().as_ref()),
            gas_used,
            logs: logs.into_iter().map(into_simulation_log).collect(),
        },
        ExecutionResult::Revert { gas_used, output } => ReplayExecution {
            success: false,
            return_data: to_hex_prefixed(output.as_ref()),
            gas_used,
            logs: Vec::new(),
        },
        ExecutionResult::Halt { reason, gas_used } => ReplayExecution {
            success: false,
            return_data: "0x".to_string(),
            gas_used,
            logs: vec![ReplaySimulationLog {
                address: "0x0000000000000000000000000000000000000000".to_string(),
                topics: vec![format!("halt:{reason:?}")],
                data: "0x".to_string(),
            }],
        },
    }
}

fn into_simulation_log(log: Log) -> ReplaySimulationLog {
    ReplaySimulationLog {
        address: format!("{:#x}", log.address),
        topics: log
            .data
            .topics()
            .iter()
            .map(|topic| format!("{:#x}", topic))
            .collect(),
        data: to_hex_prefixed(log.data.data.as_ref()),
    }
}

fn normalize_simulation_logs(logs: &[ReplaySimulationLog]) -> Vec<ReplaySimulationLog> {
    logs.iter()
        .map(|log| ReplaySimulationLog {
            address: normalize_address(&log.address),
            topics: log
                .topics
                .iter()
                .map(|topic| normalize_hex(topic))
                .collect(),
            data: normalize_hex(&log.data),
        })
        .collect()
}

fn parse_address(raw: &str, field: &str) -> Result<Address, String> {
    Address::from_str(raw).map_err(|err| format!("invalid {field} ({raw}): {err}"))
}

fn parse_bytes(raw: &str) -> Result<Bytes, String> {
    let normalized = raw.trim();
    let stripped = normalized.strip_prefix("0x").unwrap_or(normalized);
    if stripped.len() % 2 != 0 {
        return Err("hex string has odd length".to_string());
    }
    let decoded = hex::decode(stripped).map_err(|err| err.to_string())?;
    Ok(Bytes::from(decoded))
}

fn parse_u256(raw: &str) -> Result<U256, String> {
    let trimmed = raw.trim();
    if let Some(hex) = trimmed.strip_prefix("0x") {
        U256::from_str_radix(hex, 16).map_err(|err| err.to_string())
    } else {
        U256::from_str_radix(trimmed, 10).map_err(|err| err.to_string())
    }
}

fn normalize_address(value: &str) -> String {
    value.to_ascii_lowercase()
}

fn normalize_hex(value: &str) -> String {
    let trimmed = value.trim();
    let without_prefix = trimmed.strip_prefix("0x").unwrap_or(trimmed);
    if without_prefix.is_empty() {
        return "0x".to_string();
    }
    format!("0x{}", without_prefix.to_ascii_lowercase())
}

fn to_hex_prefixed(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return "0x".to_string();
    }
    format!("0x{}", hex::encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target_account(address: &str, code: &str) -> ReplayWitnessAccount {
        ReplayWitnessAccount {
            address: address.to_string(),
            balance: "0".to_string(),
            nonce: 0,
            code: code.to_string(),
            storage: BTreeMap::new(),
        }
    }

    fn caller_account(address: &str) -> ReplayWitnessAccount {
        ReplayWitnessAccount {
            address: address.to_string(),
            balance: "1000000000000000000".to_string(),
            nonce: 0,
            code: "0x".to_string(),
            storage: BTreeMap::new(),
        }
    }

    #[test]
    fn returns_incomplete_witness_when_replay_accounts_are_missing() {
        let result = verify_simulation_replay(SimulationReplayInput {
            chain_id: 1,
            safe_address: "0x1000000000000000000000000000000000000001".to_string(),
            transaction: ReplayTransaction {
                to: "0x2000000000000000000000000000000000000002".to_string(),
                value: "0".to_string(),
                data: Some("0x".to_string()),
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: true,
                return_data: Some("0x".to_string()),
                gas_used: "21000".to_string(),
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_accounts: None,
                replay_caller: None,
                replay_gas_limit: None,
            },
        });

        assert!(!result.executed);
        assert_eq!(result.reason, REASON_WITNESS_INCOMPLETE);
    }

    #[test]
    fn returns_mismatch_return_data_when_replay_output_differs() {
        // Runtime: PUSH1 0x2a PUSH1 0x00 MSTORE PUSH1 0x20 PUSH1 0x00 RETURN
        let code = "0x602a60005260206000f3";
        let caller = "0x1000000000000000000000000000000000000001";
        let target = "0x2000000000000000000000000000000000000002";

        let result = verify_simulation_replay(SimulationReplayInput {
            chain_id: 1,
            safe_address: caller.to_string(),
            transaction: ReplayTransaction {
                to: target.to_string(),
                value: "0".to_string(),
                data: Some("0x".to_string()),
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: true,
                return_data: Some("0x".to_string()),
                gas_used: "500000".to_string(),
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_accounts: Some(vec![caller_account(caller), target_account(target, code)]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(500000),
            },
        });

        assert!(result.executed);
        assert!(!result.success);
        assert_eq!(result.reason, REASON_REPLAY_MISMATCH_RETURN_DATA);
    }

    #[test]
    fn returns_success_when_replay_matches_simulation() {
        // Runtime: PUSH1 0x00 PUSH1 0x00 REVERT
        let code = "0x60006000fd";
        let caller = "0x1000000000000000000000000000000000000001";
        let target = "0x2000000000000000000000000000000000000002";

        let result = verify_simulation_replay(SimulationReplayInput {
            chain_id: 1,
            safe_address: caller.to_string(),
            transaction: ReplayTransaction {
                to: target.to_string(),
                value: "0".to_string(),
                data: Some("0x".to_string()),
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: false,
                return_data: Some("0x".to_string()),
                gas_used: "500000".to_string(),
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_accounts: Some(vec![caller_account(caller), target_account(target, code)]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(500000),
            },
        });

        assert!(result.executed);
        assert!(result.success);
    }
}
