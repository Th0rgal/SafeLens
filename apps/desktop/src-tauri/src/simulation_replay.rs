use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationReplayInput {
    pub chain_id: u64,
    pub safe_address: String,
    pub transaction: Value,
    pub simulation: Value,
    pub simulation_witness: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationReplayVerificationResult {
    pub executed: bool,
    pub success: bool,
    pub reason: String,
    pub error: Option<String>,
}

pub fn verify_simulation_replay(
    input: SimulationReplayInput,
) -> SimulationReplayVerificationResult {
    // Phase A skeleton only: wire typed command boundary and deterministic
    // reason surface before adding the full witness->revm replay engine.
    let _ = (
        input.chain_id,
        input.safe_address,
        input.transaction,
        input.simulation,
        input.simulation_witness,
    );

    SimulationReplayVerificationResult {
        executed: false,
        success: false,
        reason: "simulation-replay-not-run".to_string(),
        error: None,
    }
}
