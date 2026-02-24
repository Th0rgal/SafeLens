use revm::{
    context::{result::ExecutionResult, BlockEnv, Context, TxEnv},
    database::CacheDB,
    database_interface::EmptyDB,
    handler::{MainBuilder, MainContext},
    inspector::{InspectEvm, Inspector},
    interpreter::{CallInputs, CallOutcome, CreateInputs, CreateOutcome},
    primitives::{Address, Bytes, Log, TxKind, B256, U256},
    state::{AccountInfo, Bytecode},
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, str::FromStr};

const REASON_REPLAY_MATCHED: &str = "simulation-replay-matched";
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
    pub operation: u8,
    pub safe_tx_gas: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaySimulation {
    pub success: bool,
    pub return_data: Option<String>,
    pub gas_used: String,
    #[serde(default)]
    pub block_number: u64,
    #[serde(default)]
    pub logs: Vec<ReplaySimulationLog>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplaySimulationLog {
    pub address: String,
    #[serde(default)]
    pub topics: Vec<String>,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplayNativeTransfer {
    pub from: String,
    pub to: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayWitness {
    pub replay_block: Option<ReplayBlock>,
    pub replay_accounts: Option<Vec<ReplayWitnessAccount>>,
    pub replay_caller: Option<String>,
    pub replay_gas_limit: Option<u64>,
    pub witness_only: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayBlock {
    pub timestamp: String,
    pub gas_limit: String,
    pub base_fee_per_gas: String,
    pub beneficiary: String,
    pub prev_randao: Option<String>,
    pub difficulty: Option<String>,
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
    #[serde(rename = "replayLogs")]
    pub replay_logs: Option<Vec<ReplaySimulationLog>>,
    #[serde(rename = "replayNativeTransfers")]
    pub replay_native_transfers: Option<Vec<ReplayNativeTransfer>>,
}

#[derive(Debug)]
struct ReplayExecution {
    success: bool,
    return_data: String,
    gas_used: u64,
    logs: Vec<ReplaySimulationLog>,
    native_transfers: Vec<ReplayNativeTransfer>,
}

#[derive(Debug, Default)]
struct NativeTransferInspector {
    frame_stack: Vec<Vec<ReplayNativeTransfer>>,
    finalized: Vec<ReplayNativeTransfer>,
}

impl NativeTransferInspector {
    fn push_frame(&mut self) {
        self.frame_stack.push(Vec::new());
    }

    fn settle_frame(&mut self, mut frame_transfers: Vec<ReplayNativeTransfer>) {
        if let Some(parent_frame) = self.frame_stack.last_mut() {
            parent_frame.append(&mut frame_transfers);
        } else {
            self.finalized.append(&mut frame_transfers);
        }
    }

    fn push_transfer(&mut self, transfer: ReplayNativeTransfer) {
        if let Some(current_frame) = self.frame_stack.last_mut() {
            current_frame.push(transfer);
        } else {
            self.finalized.push(transfer);
        }
    }

    fn into_transfers(self) -> Vec<ReplayNativeTransfer> {
        self.finalized
    }
}

impl<CTX, INTR> Inspector<CTX, INTR> for NativeTransferInspector
where
    INTR: revm::interpreter::InterpreterTypes,
{
    fn call(&mut self, _context: &mut CTX, _inputs: &mut CallInputs) -> Option<CallOutcome> {
        self.push_frame();
        None
    }

    fn call_end(&mut self, _context: &mut CTX, inputs: &CallInputs, outcome: &mut CallOutcome) {
        let mut frame_transfers = self.frame_stack.pop().unwrap_or_default();

        if outcome.instruction_result().is_ok() {
            if let Some(value) = inputs.transfer_value() {
                if value > U256::ZERO {
                    frame_transfers.insert(
                        0,
                        ReplayNativeTransfer {
                            from: format!("{:#x}", inputs.transfer_from()),
                            to: format!("{:#x}", inputs.transfer_to()),
                            value: value.to_string(),
                        },
                    );
                }
            }
            self.settle_frame(frame_transfers);
        }
    }

    fn create(&mut self, _context: &mut CTX, _inputs: &mut CreateInputs) -> Option<CreateOutcome> {
        self.push_frame();
        None
    }

    fn create_end(
        &mut self,
        _context: &mut CTX,
        inputs: &CreateInputs,
        outcome: &mut CreateOutcome,
    ) {
        let mut frame_transfers = self.frame_stack.pop().unwrap_or_default();

        if outcome.instruction_result().is_ok() {
            let value = inputs.value();
            if value > U256::ZERO {
                if let Some(created) = outcome.address {
                    frame_transfers.insert(
                        0,
                        ReplayNativeTransfer {
                            from: format!("{:#x}", inputs.caller()),
                            to: format!("{:#x}", created),
                            value: value.to_string(),
                        },
                    );
                }
            }
            self.settle_frame(frame_transfers);
        }
    }

    fn selfdestruct(&mut self, contract: Address, target: Address, value: U256) {
        if value > U256::ZERO {
            self.push_transfer(ReplayNativeTransfer {
                from: format!("{:#x}", contract),
                to: format!("{:#x}", target),
                value: value.to_string(),
            });
        }
    }
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
            replay_logs: None,
            replay_native_transfers: None,
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
                replay_logs: None,
                replay_native_transfers: None,
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
            replay_logs: Some(replay.logs.clone()),
            replay_native_transfers: Some(replay.native_transfers.clone()),
        };
    }

    let witness_only = input.simulation_witness.witness_only.unwrap_or(false);
    if replay.return_data != expected_return_data {
        return SimulationReplayVerificationResult {
            executed: true,
            success: false,
            reason: REASON_REPLAY_MISMATCH_RETURN_DATA.to_string(),
            error: Some(format!(
                "Replay returnData mismatch: replay={}, simulation={}",
                replay.return_data, expected_return_data
            )),
            replay_logs: Some(replay.logs.clone()),
            replay_native_transfers: Some(replay.native_transfers.clone()),
        };
    }

    if !witness_only {
        let expected_logs = normalize_simulation_logs(&input.simulation.logs);
        let replay_logs = normalize_simulation_logs(&replay.logs);
        if replay_logs != expected_logs {
            return SimulationReplayVerificationResult {
                executed: true,
                success: false,
                reason: REASON_REPLAY_MISMATCH_LOGS.to_string(),
                error: Some("Replay logs mismatch against packaged simulation logs.".to_string()),
                replay_logs: Some(replay.logs.clone()),
                replay_native_transfers: Some(replay.native_transfers.clone()),
            };
        }
    }

    let expected_gas_used = match parse_u256(&input.simulation.gas_used) {
        Ok(v) => v,
        Err(err) => {
            return SimulationReplayVerificationResult {
                executed: true,
                success: false,
                reason: REASON_REPLAY_EXEC_ERROR.to_string(),
                error: Some(format!("Invalid simulation.gasUsed: {err}")),
                replay_logs: Some(replay.logs.clone()),
                replay_native_transfers: Some(replay.native_transfers.clone()),
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
            replay_logs: Some(replay.logs.clone()),
            replay_native_transfers: Some(replay.native_transfers.clone()),
        };
    }

    SimulationReplayVerificationResult {
        executed: true,
        success: true,
        reason: REASON_REPLAY_MATCHED.to_string(),
        error: None,
        replay_logs: Some(replay.logs),
        replay_native_transfers: Some(replay.native_transfers),
    }
}

fn execute_replay(
    input: &SimulationReplayInput,
    accounts: &[ReplayWitnessAccount],
) -> Result<ReplayExecution, String> {
    let witness_only = input.simulation_witness.witness_only.unwrap_or(false);
    let mut db = CacheDB::new(EmptyDB::default());

    let caller = match input.simulation_witness.replay_caller.as_deref() {
        Some(raw) => parse_address(raw, "simulationWitness.replayCaller")?,
        None => parse_address(&input.safe_address, "safeAddress")?,
    };
    let caller_account = accounts.iter().find(|account| {
        parse_address(&account.address, "replay account address").ok() == Some(caller)
    });
    let caller_nonce = caller_account.map(|account| account.nonce).unwrap_or(0);

    let to = parse_address(&input.transaction.to, "transaction.to")?;
    let inner_value = parse_u256(&input.transaction.value)
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

    let tx_kind = match input.transaction.operation {
        0 => TxKind::Call(to),
        1 => return Err(
            "transaction.operation=1 (DELEGATECALL) is not replay-supported in the local verifier."
                .to_string(),
        ),
        value => {
            return Err(format!(
                "invalid transaction.operation: expected 0 (CALL) or 1 (DELEGATECALL), got {value}"
            ))
        }
    };

    let gas_price = resolve_replay_gas_price(input)?;
    let required_caller_balance = (U256::from(gas_limit) * U256::from(gas_price)) + inner_value;

    for account in accounts {
        let address = parse_address(&account.address, "replay account address")?;
        let mut balance = parse_u256(&account.balance)
            .map_err(|err| format!("invalid replay account balance for {address:#x}: {err}"))?;
        let code = parse_bytes(&account.code)
            .map_err(|err| format!("invalid replay account code for {address:#x}: {err}"))?;

        if address == caller && balance < required_caller_balance {
            balance = required_caller_balance;
        }

        db.insert_account_info(
            address,
            AccountInfo::new(balance, account.nonce, B256::ZERO, Bytecode::new_raw(code)),
        );

        for (slot, value) in &account.storage {
            let slot_key = parse_u256(slot)
                .map_err(|err| format!("invalid storage key for {address:#x}: {err}"))?;
            let slot_value = parse_u256(value)
                .map_err(|err| format!("invalid storage value for {address:#x}: {err}"))?;
            db.insert_account_storage(address, slot_key, slot_value)
                .map_err(|err| format!("failed to seed storage for {address:#x}: {err}"))?;
        }
    }

    if caller_account.is_none() {
        db.insert_account_info(
            caller,
            AccountInfo::new(
                required_caller_balance,
                caller_nonce,
                B256::ZERO,
                Bytecode::new_raw(Bytes::new()),
            ),
        );
    }
    let tx = TxEnv::builder()
        .caller(caller)
        .kind(tx_kind)
        .gas_limit(gas_limit)
        .gas_price(gas_price)
        .nonce(caller_nonce)
        .chain_id(Some(input.chain_id))
        .value(inner_value)
        .data(data)
        .build()
        .map_err(|err| format!("failed to build replay tx: {err:?}"))?;

    let block = resolve_replay_block(input, witness_only)?;
    let ctx = Context::mainnet()
        .modify_cfg_chained(|cfg| {
            cfg.chain_id = input.chain_id;
        })
        .with_block(block)
        .with_db(db);
    let mut inspector = NativeTransferInspector::default();
    let mut evm = ctx.build_mainnet_with_inspector(&mut inspector);
    let replay = evm
        .inspect_one_tx(tx)
        .map_err(|err| format!("local replay transaction failed: {err}"))?;
    let native_transfers = inspector.into_transfers();

    Ok(extract_execution(replay, native_transfers))
}

fn resolve_replay_block(
    input: &SimulationReplayInput,
    witness_only: bool,
) -> Result<BlockEnv, String> {
    match input.simulation_witness.replay_block.as_ref() {
        Some(block) => build_replay_block_env(block, input.simulation.block_number),
        None if witness_only => Err(
            "simulationWitness.replayBlock is missing; witness-only replay requires full block context."
                .to_string(),
        ),
        None => Ok(default_replay_block(input.simulation.block_number)),
    }
}

fn build_replay_block_env(block: &ReplayBlock, block_number: u64) -> Result<BlockEnv, String> {
    let beneficiary = parse_address(
        &block.beneficiary,
        "simulationWitness.replayBlock.beneficiary",
    )?;
    let timestamp = parse_u256(&block.timestamp)
        .map_err(|err| format!("invalid simulationWitness.replayBlock.timestamp: {err}"))?;
    let gas_limit_u256 = parse_u256(&block.gas_limit)
        .map_err(|err| format!("invalid simulationWitness.replayBlock.gasLimit: {err}"))?;
    if gas_limit_u256 > U256::from(u64::MAX) {
        return Err("simulationWitness.replayBlock.gasLimit exceeds u64 range.".to_string());
    }
    let gas_limit = gas_limit_u256.to::<u64>();
    let basefee_u256 = parse_u256(&block.base_fee_per_gas)
        .map_err(|err| format!("invalid simulationWitness.replayBlock.baseFeePerGas: {err}"))?;
    if basefee_u256 > U256::from(u64::MAX) {
        return Err("simulationWitness.replayBlock.baseFeePerGas exceeds u64 range.".to_string());
    }
    let basefee = basefee_u256.to::<u64>();
    let prevrandao = match block.prev_randao.as_deref() {
        Some(raw) => Some(parse_b256(raw, "simulationWitness.replayBlock.prevRandao")?),
        None => None,
    };
    let difficulty = match block.difficulty.as_deref() {
        Some(raw) => parse_u256(raw)
            .map_err(|err| format!("invalid simulationWitness.replayBlock.difficulty: {err}"))?,
        None => U256::ZERO,
    };

    Ok(BlockEnv {
        number: U256::from(block_number),
        beneficiary,
        timestamp,
        gas_limit,
        basefee,
        difficulty,
        prevrandao,
        ..Default::default()
    })
}

fn resolve_replay_gas_price(input: &SimulationReplayInput) -> Result<u128, String> {
    let Some(block) = input.simulation_witness.replay_block.as_ref() else {
        return Ok(0);
    };

    let basefee = parse_u256(&block.base_fee_per_gas)
        .map_err(|err| format!("invalid simulationWitness.replayBlock.baseFeePerGas: {err}"))?;
    if basefee > U256::from(u128::MAX) {
        return Err("simulationWitness.replayBlock.baseFeePerGas exceeds u128 range.".to_string());
    }
    Ok(basefee.to::<u128>())
}

fn default_replay_block(block_number: u64) -> BlockEnv {
    BlockEnv {
        number: U256::from(block_number),
        ..Default::default()
    }
}

fn extract_execution(
    result: ExecutionResult,
    native_transfers: Vec<ReplayNativeTransfer>,
) -> ReplayExecution {
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
            native_transfers,
        },
        ExecutionResult::Revert { gas_used, output } => ReplayExecution {
            success: false,
            return_data: to_hex_prefixed(output.as_ref()),
            gas_used,
            logs: Vec::new(),
            native_transfers: Vec::new(),
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
            native_transfers: Vec::new(),
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
    if !stripped.len().is_multiple_of(2) {
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

fn parse_b256(raw: &str, field: &str) -> Result<B256, String> {
    B256::from_str(raw).map_err(|err| format!("invalid {field} ({raw}): {err}"))
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
    use std::{env, fs, time::Instant};

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
        caller_account_with_nonce(address, 0)
    }

    fn caller_account_with_nonce(address: &str, nonce: u64) -> ReplayWitnessAccount {
        ReplayWitnessAccount {
            address: address.to_string(),
            balance: "1000000000000000000".to_string(),
            nonce,
            code: "0x".to_string(),
            storage: BTreeMap::new(),
        }
    }

    fn replay_block(timestamp: &str) -> ReplayBlock {
        ReplayBlock {
            timestamp: timestamp.to_string(),
            gas_limit: "30000000".to_string(),
            base_fee_per_gas: "1".to_string(),
            beneficiary: "0x0000000000000000000000000000000000000000".to_string(),
            prev_randao: Some(
                "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
            ),
            difficulty: Some("0".to_string()),
        }
    }

    fn build_create_runtime(init_code: &[u8], create_value: u8) -> String {
        assert!(
            init_code.len() <= u8::MAX as usize,
            "init code must fit PUSH1 length"
        );

        let init_len = init_code.len() as u8;
        let mut runtime = vec![
            0x60,
            init_len, // PUSH1 <len>
            0x60,
            0x00, // PUSH1 <offset> placeholder
            0x60,
            0x00, // PUSH1 0
            0x39, // CODECOPY
            0x60,
            init_len, // PUSH1 <len>
            0x60,
            0x00, // PUSH1 0
            0x60,
            create_value, // PUSH1 <create value>
            0xf0,         // CREATE
            0x00,         // STOP
        ];
        runtime[3] = runtime.len() as u8;
        runtime.extend_from_slice(init_code);

        format!("0x{}", hex::encode(runtime))
    }

    fn build_reverting_create_init_code_with_inner_call(
        receiver: &str,
        inner_value: u8,
    ) -> Vec<u8> {
        let receiver_bytes = parse_address(receiver, "receiver")
            .expect("receiver must be a valid address")
            .into_array();

        let mut init_code = vec![
            0x60,
            0x00, // PUSH1 0 (retSize)
            0x60,
            0x00, // PUSH1 0 (retOffset)
            0x60,
            0x00, // PUSH1 0 (argsSize)
            0x60,
            0x00, // PUSH1 0 (argsOffset)
            0x60,
            inner_value, // PUSH1 <value>
            0x73,        // PUSH20 <receiver>
        ];
        init_code.extend_from_slice(&receiver_bytes);
        init_code.extend_from_slice(&[
            0x60, 0xff, // PUSH1 255 gas
            0xf1, // CALL
            0x50, // POP
            0x60, 0x00, // PUSH1 0
            0x60, 0x00, // PUSH1 0
            0xfd, // REVERT
        ]);
        init_code
    }

    fn build_create_init_code_with_inner_call(receiver: &str, inner_value: u8) -> Vec<u8> {
        let receiver_bytes = parse_address(receiver, "receiver")
            .expect("receiver must be a valid address")
            .into_array();

        let mut init_code = vec![
            0x60,
            0x00, // PUSH1 0 (retSize)
            0x60,
            0x00, // PUSH1 0 (retOffset)
            0x60,
            0x00, // PUSH1 0 (argsSize)
            0x60,
            0x00, // PUSH1 0 (argsOffset)
            0x60,
            inner_value, // PUSH1 <value>
            0x73,        // PUSH20 <receiver>
        ];
        init_code.extend_from_slice(&receiver_bytes);
        init_code.extend_from_slice(&[
            0x60, 0xff, // PUSH1 255 gas
            0xf1, // CALL
            0x50, // POP
            0x60, 0x00, // PUSH1 0
            0x60, 0x00, // PUSH1 0
            0xf3, // RETURN (empty runtime)
        ]);
        init_code
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
                operation: 0,
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: true,
                return_data: Some("0x".to_string()),
                gas_used: "21000".to_string(),
                block_number: 1,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: None,
                replay_accounts: None,
                replay_caller: None,
                replay_gas_limit: None,
                witness_only: None,
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
                operation: 0,
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: true,
                return_data: Some("0x".to_string()),
                gas_used: "500000".to_string(),
                block_number: 1,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: Some(replay_block("1")),
                replay_accounts: Some(vec![caller_account(caller), target_account(target, code)]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(500000),
                witness_only: None,
            },
        });

        assert!(result.executed);
        assert!(!result.success);
        assert_eq!(
            result.reason, REASON_REPLAY_MISMATCH_RETURN_DATA,
            "{result:?}"
        );
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
                operation: 0,
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: false,
                return_data: Some("0x".to_string()),
                gas_used: "500000".to_string(),
                block_number: 1,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: Some(replay_block("1")),
                replay_accounts: Some(vec![caller_account(caller), target_account(target, code)]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(500000),
                witness_only: None,
            },
        });

        assert!(result.executed);
        assert!(result.success, "{result:?}");
        assert_eq!(result.reason, REASON_REPLAY_MATCHED);
    }

    #[test]
    fn returns_success_when_replay_matches_on_non_mainnet_chain_id() {
        // Runtime: PUSH1 0x00 PUSH1 0x00 REVERT
        let code = "0x60006000fd";
        let caller = "0x1000000000000000000000000000000000000001";
        let target = "0x2000000000000000000000000000000000000002";

        let result = verify_simulation_replay(SimulationReplayInput {
            chain_id: 100,
            safe_address: caller.to_string(),
            transaction: ReplayTransaction {
                to: target.to_string(),
                value: "0".to_string(),
                data: Some("0x".to_string()),
                operation: 0,
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: false,
                return_data: Some("0x".to_string()),
                gas_used: "500000".to_string(),
                block_number: 1,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: Some(replay_block("1")),
                replay_accounts: Some(vec![caller_account(caller), target_account(target, code)]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(500000),
                witness_only: None,
            },
        });

        assert!(result.executed);
        assert!(result.success, "{result:?}");
        assert_eq!(result.reason, REASON_REPLAY_MATCHED);
    }

    #[test]
    fn uses_caller_nonce_from_witness_account_snapshot() {
        // Runtime: PUSH1 0x00 PUSH1 0x00 REVERT
        let code = "0x60006000fd";
        let caller = "0x1000000000000000000000000000000000000001";
        let target = "0x2000000000000000000000000000000000000002";

        let result = verify_simulation_replay(SimulationReplayInput {
            chain_id: 100,
            safe_address: caller.to_string(),
            transaction: ReplayTransaction {
                to: target.to_string(),
                value: "0".to_string(),
                data: Some("0x".to_string()),
                operation: 0,
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: false,
                return_data: Some("0x".to_string()),
                gas_used: "500000".to_string(),
                block_number: 1,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: Some(replay_block("1")),
                replay_accounts: Some(vec![
                    caller_account_with_nonce(caller, 340),
                    target_account(target, code),
                ]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(500000),
                witness_only: None,
            },
        });

        assert!(result.executed);
        assert!(result.success, "{result:?}");
        assert_eq!(result.reason, REASON_REPLAY_MATCHED);
    }

    #[test]
    fn replays_witness_only_native_transfer_with_high_caller_nonce() {
        let caller = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
        let target = "0x5bb21b30e912871d27182e7b7f9c37c888269cb2";

        let result = verify_simulation_replay(SimulationReplayInput {
            chain_id: 100,
            safe_address: "0xba260842b007fab4119c9747d709119de4257276".to_string(),
            transaction: ReplayTransaction {
                to: target.to_string(),
                value: "1000000000000000000".to_string(),
                data: Some("0x".to_string()),
                operation: 0,
                safe_tx_gas: Some("0".to_string()),
            },
            simulation: ReplaySimulation {
                success: true,
                return_data: Some("0x".to_string()),
                gas_used: "500000".to_string(),
                block_number: 1,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: Some(replay_block("1")),
                replay_accounts: Some(vec![
                    ReplayWitnessAccount {
                        address: caller.to_string(),
                        balance: "100000000000000000000".to_string(),
                        nonce: 340,
                        code: "0x".to_string(),
                        storage: BTreeMap::new(),
                    },
                    target_account(target, "0x"),
                ]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(3_000_000),
                witness_only: Some(true),
            },
        });

        assert!(result.executed);
        assert!(result.success, "{result:?}");
        assert_eq!(result.reason, REASON_REPLAY_MATCHED);
        assert_eq!(
            result.replay_native_transfers,
            Some(vec![ReplayNativeTransfer {
                from: caller.to_string(),
                to: target.to_string(),
                value: "1000000000000000000".to_string(),
            }])
        );
    }

    #[test]
    fn returns_mismatch_return_data_in_witness_only_mode() {
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
                operation: 0,
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: true,
                return_data: Some("0x".to_string()),
                gas_used: "500000".to_string(),
                block_number: 1,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: Some(replay_block("1")),
                replay_accounts: Some(vec![caller_account(caller), target_account(target, code)]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(500000),
                witness_only: Some(true),
            },
        });

        assert!(result.executed);
        assert!(!result.success);
        assert_eq!(result.reason, REASON_REPLAY_MISMATCH_RETURN_DATA);
    }

    #[test]
    fn captures_create_value_transfer_in_replay_native_transfers() {
        let caller = "0x1000000000000000000000000000000000000001";
        let factory = "0x2000000000000000000000000000000000000002";
        let init_code = hex::decode("60006000f3").expect("valid init code");
        let factory_code = build_create_runtime(&init_code, 1);

        let result = verify_simulation_replay(SimulationReplayInput {
            chain_id: 100,
            safe_address: caller.to_string(),
            transaction: ReplayTransaction {
                to: factory.to_string(),
                value: "0".to_string(),
                data: Some("0x".to_string()),
                operation: 0,
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: true,
                return_data: Some("0x".to_string()),
                gas_used: "500000".to_string(),
                block_number: 1,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: Some(replay_block("1")),
                replay_accounts: Some(vec![
                    caller_account(caller),
                    ReplayWitnessAccount {
                        address: factory.to_string(),
                        balance: "100".to_string(),
                        nonce: 1,
                        code: factory_code,
                        storage: BTreeMap::new(),
                    },
                ]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(500000),
                witness_only: Some(true),
            },
        });

        assert!(result.executed);
        assert!(result.success, "{result:?}");
        let transfers = result.replay_native_transfers.unwrap_or_default();
        assert_eq!(transfers.len(), 1, "{transfers:?}");
        assert_eq!(transfers[0].from, factory);
        assert_eq!(transfers[0].value, "1");
    }

    #[test]
    fn drops_inner_call_transfers_when_create_reverts() {
        let caller = "0x3000000000000000000000000000000000000003";
        let factory = "0x4000000000000000000000000000000000000004";
        let receiver = "0x5000000000000000000000000000000000000005";
        let init_code = build_reverting_create_init_code_with_inner_call(receiver, 1);
        let factory_code = build_create_runtime(&init_code, 1);

        let result = verify_simulation_replay(SimulationReplayInput {
            chain_id: 100,
            safe_address: caller.to_string(),
            transaction: ReplayTransaction {
                to: factory.to_string(),
                value: "0".to_string(),
                data: Some("0x".to_string()),
                operation: 0,
                safe_tx_gas: Some("800000".to_string()),
            },
            simulation: ReplaySimulation {
                success: true,
                return_data: Some("0x".to_string()),
                gas_used: "800000".to_string(),
                block_number: 1,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: Some(replay_block("1")),
                replay_accounts: Some(vec![
                    caller_account(caller),
                    ReplayWitnessAccount {
                        address: factory.to_string(),
                        balance: "1000000000000000000".to_string(),
                        nonce: 1,
                        code: factory_code,
                        storage: BTreeMap::new(),
                    },
                    target_account(receiver, "0x"),
                ]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(800000),
                witness_only: Some(true),
            },
        });

        assert!(result.executed);
        assert!(result.success, "{result:?}");
        assert_eq!(result.replay_native_transfers, Some(Vec::new()));
    }

    #[test]
    fn preserves_chronological_native_transfer_order_for_nested_create_calls() {
        let caller = "0x6000000000000000000000000000000000000006";
        let factory = "0x7000000000000000000000000000000000000007";
        let receiver = "0x8000000000000000000000000000000000000008";
        let init_code = build_create_init_code_with_inner_call(receiver, 1);
        let factory_code = build_create_runtime(&init_code, 2);

        let result = verify_simulation_replay(SimulationReplayInput {
            chain_id: 100,
            safe_address: caller.to_string(),
            transaction: ReplayTransaction {
                to: factory.to_string(),
                value: "0".to_string(),
                data: Some("0x".to_string()),
                operation: 0,
                safe_tx_gas: Some("800000".to_string()),
            },
            simulation: ReplaySimulation {
                success: true,
                return_data: Some("0x".to_string()),
                gas_used: "800000".to_string(),
                block_number: 1,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: Some(replay_block("1")),
                replay_accounts: Some(vec![
                    caller_account(caller),
                    ReplayWitnessAccount {
                        address: factory.to_string(),
                        balance: "1000000000000000000".to_string(),
                        nonce: 1,
                        code: factory_code,
                        storage: BTreeMap::new(),
                    },
                    target_account(receiver, "0x"),
                ]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(800000),
                witness_only: Some(true),
            },
        });

        assert!(result.executed);
        assert!(result.success, "{result:?}");
        let transfers = result.replay_native_transfers.unwrap_or_default();
        assert_eq!(transfers.len(), 2, "{transfers:?}");
        assert_eq!(transfers[0].from, factory);
        assert_eq!(transfers[0].value, "2");
        assert_eq!(transfers[1].from, transfers[0].to);
        assert_eq!(transfers[1].to, receiver);
        assert_eq!(transfers[1].value, "1");
    }

    #[test]
    fn returns_exec_error_for_delegatecall_operation() {
        let caller = "0x1000000000000000000000000000000000000001";
        let target = "0x2000000000000000000000000000000000000002";

        let result = verify_simulation_replay(SimulationReplayInput {
            chain_id: 1,
            safe_address: caller.to_string(),
            transaction: ReplayTransaction {
                to: target.to_string(),
                value: "0".to_string(),
                data: Some("0x".to_string()),
                operation: 1,
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: true,
                return_data: Some("0x".to_string()),
                gas_used: "500000".to_string(),
                block_number: 1,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: Some(replay_block("1")),
                replay_accounts: Some(vec![caller_account(caller), target_account(target, "0x")]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(500000),
                witness_only: None,
            },
        });

        assert!(result.executed);
        assert!(!result.success);
        assert_eq!(result.reason, REASON_REPLAY_EXEC_ERROR);
        assert!(result
            .error
            .as_deref()
            .unwrap_or("")
            .contains("DELEGATECALL"));
    }

    fn percentile(sorted: &[u128], p: f64) -> u128 {
        let idx = ((sorted.len() as f64 - 1.0) * p).round() as usize;
        sorted[idx]
    }

    #[test]
    #[ignore = "manual benchmark run; use -- --ignored --nocapture"]
    fn benchmark_replay_latency_profiles() {
        let caller = "0x1000000000000000000000000000000000000001";
        let target = "0x2000000000000000000000000000000000000002";
        let iterations = 50usize;

        // Scenario A: short successful return path.
        let success_code = "0x602a60005260206000f3";
        // Scenario B: deterministic revert path.
        let revert_code = "0x60006000fd";
        let scenarios = vec![
            (
                "erc20-transfer-like",
                success_code,
                true,
                "0x000000000000000000000000000000000000000000000000000000000000002a",
                Vec::<ReplaySimulationLog>::new(),
            ),
            (
                "allowance-swap-like",
                success_code,
                true,
                "0x000000000000000000000000000000000000000000000000000000000000002a",
                Vec::<ReplaySimulationLog>::new(),
            ),
            (
                "multisend-like",
                success_code,
                true,
                "0x000000000000000000000000000000000000000000000000000000000000002a",
                Vec::<ReplaySimulationLog>::new(),
            ),
            (
                "revert-path",
                revert_code,
                false,
                "0x",
                Vec::<ReplaySimulationLog>::new(),
            ),
        ];

        for (name, code, expected_success, expected_return, expected_logs) in scenarios {
            let mut samples_ms = Vec::with_capacity(iterations);
            for _ in 0..iterations {
                let input = SimulationReplayInput {
                    chain_id: 1,
                    safe_address: caller.to_string(),
                    transaction: ReplayTransaction {
                        to: target.to_string(),
                        value: "0".to_string(),
                        data: Some("0x".to_string()),
                        operation: 0,
                        safe_tx_gas: Some("500000".to_string()),
                    },
                    simulation: ReplaySimulation {
                        success: expected_success,
                        return_data: Some(expected_return.to_string()),
                        gas_used: "500000".to_string(),
                        block_number: 1,
                        logs: expected_logs.clone(),
                    },
                    simulation_witness: ReplayWitness {
                        replay_block: Some(replay_block("1")),
                        replay_accounts: Some(vec![
                            caller_account(caller),
                            target_account(target, code),
                        ]),
                        replay_caller: Some(caller.to_string()),
                        replay_gas_limit: Some(500000),
                        witness_only: None,
                    },
                };

                let started = Instant::now();
                let result = verify_simulation_replay(input);
                let elapsed = started.elapsed().as_millis();
                assert!(result.executed, "{name} should execute replay");
                assert!(
                    result.success,
                    "{name} should have matched expected simulation output"
                );
                samples_ms.push(elapsed);
            }

            samples_ms.sort_unstable();
            let p50 = percentile(&samples_ms, 0.50);
            let p95 = percentile(&samples_ms, 0.95);
            println!("{name}: p50={}ms p95={}ms samples={}", p50, p95, iterations);
        }
    }

    #[test]
    fn returns_incomplete_when_witness_only_replay_block_is_missing() {
        let caller = "0x1000000000000000000000000000000000000001";
        let target = "0x2000000000000000000000000000000000000002";

        let result = verify_simulation_replay(SimulationReplayInput {
            chain_id: 1,
            safe_address: caller.to_string(),
            transaction: ReplayTransaction {
                to: target.to_string(),
                value: "0".to_string(),
                data: Some("0x".to_string()),
                operation: 0,
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: true,
                return_data: Some("0x".to_string()),
                gas_used: "500000".to_string(),
                block_number: 1,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: None,
                replay_accounts: Some(vec![caller_account(caller), target_account(target, "0x")]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(500000),
                witness_only: Some(true),
            },
        });

        assert!(!result.success);
        assert_eq!(result.reason, REASON_REPLAY_EXEC_ERROR);
        assert!(result
            .error
            .as_deref()
            .unwrap_or("")
            .contains("simulationWitness.replayBlock is missing"));
    }

    #[test]
    fn uses_replay_block_timestamp_for_timestamp_opcode_paths() {
        // Runtime: TIMESTAMP PUSH1 0x00 MSTORE PUSH1 0x20 PUSH1 0x00 RETURN
        let code = "0x4260005260206000f3";
        let caller = "0x1000000000000000000000000000000000000001";
        let target = "0x2000000000000000000000000000000000000002";
        let expected_timestamp =
            "0x000000000000000000000000000000000000000000000000000000000000002a";

        let result = verify_simulation_replay(SimulationReplayInput {
            chain_id: 1,
            safe_address: caller.to_string(),
            transaction: ReplayTransaction {
                to: target.to_string(),
                value: "0".to_string(),
                data: Some("0x".to_string()),
                operation: 0,
                safe_tx_gas: Some("500000".to_string()),
            },
            simulation: ReplaySimulation {
                success: true,
                return_data: Some(expected_timestamp.to_string()),
                gas_used: "500000".to_string(),
                block_number: 42,
                logs: Vec::new(),
            },
            simulation_witness: ReplayWitness {
                replay_block: Some(replay_block("42")),
                replay_accounts: Some(vec![caller_account(caller), target_account(target, code)]),
                replay_caller: Some(caller.to_string()),
                replay_gas_limit: Some(500000),
                witness_only: Some(true),
            },
        });

        assert!(result.executed);
        assert!(result.success, "{result:?}");
        assert_eq!(result.reason, REASON_REPLAY_MATCHED);
    }

    #[test]
    fn e2e_replay_from_payload_file_when_configured() {
        let Ok(path) = env::var("SAFELENS_E2E_REPLAY_INPUT") else {
            return;
        };

        let raw = fs::read_to_string(&path)
            .unwrap_or_else(|err| panic!("failed to read SAFELENS_E2E_REPLAY_INPUT={path}: {err}"));
        let input: SimulationReplayInput = serde_json::from_str(&raw)
            .unwrap_or_else(|err| panic!("failed to parse replay payload JSON from {path}: {err}"));

        let result = verify_simulation_replay(input);
        assert!(
            result.executed,
            "expected replay to execute, got: {result:?}"
        );
        assert!(result.success, "expected replay success, got: {result:?}");
    }
}
