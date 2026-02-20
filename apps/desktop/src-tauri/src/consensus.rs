//! Consensus proof verification using Helios consensus-core.
//!
//! Verifies BLS sync committee signatures over beacon block headers
//! to authenticate the EVM state root. This is a pure computation —
//! no network access needed. All data comes from the evidence package.

use std::time::{SystemTime, UNIX_EPOCH};

use alloy::primitives::{b256, fixed_bytes, B256};
use helios_consensus_core::{
    apply_bootstrap, apply_finality_update, apply_update,
    consensus_spec::{ConsensusSpec, MainnetConsensusSpec},
    types::{Bootstrap, FinalityUpdate, Fork, Forks, LightClientStore, Update},
    verify_bootstrap, verify_finality_update, verify_update,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use typenum::{U1, U128, U131072, U16, U2, U2048, U4096, U512, U64, U8, U8192};

/// Input from the frontend: the consensus proof section of an evidence package.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsensusProofInput {
    pub checkpoint: Option<String>,
    pub bootstrap: Option<String>,
    pub updates: Option<Vec<String>>,
    pub finality_update: Option<String>,
    #[serde(default = "default_consensus_mode")]
    pub consensus_mode: String,
    pub network: String,
    pub proof_payload: Option<String>,
    #[allow(dead_code)]
    pub state_root: String,
    pub expected_state_root: String,
    #[allow(dead_code)]
    pub block_number: u64,
    pub package_chain_id: Option<u64>,
}

fn default_consensus_mode() -> String {
    "beacon".to_string()
}

/// Result returned to the frontend after verification.
#[derive(Debug, Serialize)]
pub struct ConsensusVerificationResult {
    /// Whether the consensus proof is valid.
    pub valid: bool,
    /// The verified EVM state root (from the finalized execution payload).
    pub verified_state_root: Option<String>,
    /// The block number from the finalized execution payload.
    pub verified_block_number: Option<u64>,
    /// Whether the verified state root matches the claimed one.
    pub state_root_matches: bool,
    /// Number of sync committee participants (out of 512).
    pub sync_committee_participants: u64,
    /// Human-readable error if verification failed.
    pub error: Option<String>,
    /// Machine-readable error code for deterministic trust-boundary handling.
    pub error_code: Option<String>,
    /// Individual check results.
    pub checks: Vec<ConsensusCheck>,
}

#[derive(Debug, Serialize)]
pub struct ConsensusCheck {
    pub id: String,
    pub label: String,
    pub passed: bool,
    pub detail: Option<String>,
}

/// Network configuration for beacon chain consensus.
struct NetworkConfig {
    genesis_root: B256,
    genesis_time: u64,
    seconds_per_slot: u64,
    forks: Forks,
}

#[derive(Clone, Copy, Debug)]
enum ConsensusNetwork {
    Mainnet,
    Sepolia,
    Holesky,
    Hoodi,
    Gnosis,
}

fn mainnet_config() -> NetworkConfig {
    NetworkConfig {
        genesis_root: b256!("4b363db94e286120d76eb905340fdd4e54bfe9f06bf33ff6cf5ad27f511bfe95"),
        genesis_time: 1606824023,
        seconds_per_slot: 12,
        forks: Forks {
            genesis: Fork {
                epoch: 0,
                fork_version: fixed_bytes!("00000000"),
            },
            altair: Fork {
                epoch: 74240,
                fork_version: fixed_bytes!("01000000"),
            },
            bellatrix: Fork {
                epoch: 144896,
                fork_version: fixed_bytes!("02000000"),
            },
            capella: Fork {
                epoch: 194048,
                fork_version: fixed_bytes!("03000000"),
            },
            deneb: Fork {
                epoch: 269568,
                fork_version: fixed_bytes!("04000000"),
            },
            electra: Fork {
                epoch: 364032,
                fork_version: fixed_bytes!("05000000"),
            },
            fulu: Fork {
                epoch: 411392,
                fork_version: fixed_bytes!("06000000"),
            },
        },
    }
}

fn sepolia_config() -> NetworkConfig {
    NetworkConfig {
        genesis_root: b256!("d8ea171f3c94aea21ebc42a1ed61052acf3f9209c00e4efbaaddac09ed9b8078"),
        genesis_time: 1655733600,
        seconds_per_slot: 12,
        forks: Forks {
            genesis: Fork {
                epoch: 0,
                fork_version: fixed_bytes!("90000069"),
            },
            altair: Fork {
                epoch: 50,
                fork_version: fixed_bytes!("90000070"),
            },
            bellatrix: Fork {
                epoch: 100,
                fork_version: fixed_bytes!("90000071"),
            },
            capella: Fork {
                epoch: 56832,
                fork_version: fixed_bytes!("90000072"),
            },
            deneb: Fork {
                epoch: 132608,
                fork_version: fixed_bytes!("90000073"),
            },
            electra: Fork {
                epoch: 222464,
                fork_version: fixed_bytes!("90000074"),
            },
            fulu: Fork {
                epoch: 272640,
                fork_version: fixed_bytes!("90000075"),
            },
        },
    }
}

fn gnosis_config() -> NetworkConfig {
    // Source: https://github.com/gnosischain/configs/blob/main/mainnet/config.yaml
    NetworkConfig {
        genesis_root: b256!("f5dcb5564e829aab27264b9becd5dfaa017085611224cb3036f573368dbb9d47"),
        genesis_time: 1638993340,
        seconds_per_slot: 5,
        forks: Forks {
            genesis: Fork {
                epoch: 0,
                fork_version: fixed_bytes!("00000064"),
            },
            altair: Fork {
                epoch: 512,
                fork_version: fixed_bytes!("01000064"),
            },
            bellatrix: Fork {
                epoch: 385536,
                fork_version: fixed_bytes!("02000064"),
            },
            capella: Fork {
                epoch: 648704,
                fork_version: fixed_bytes!("03000064"),
            },
            deneb: Fork {
                epoch: 889856,
                fork_version: fixed_bytes!("04000064"),
            },
            electra: Fork {
                epoch: 1337856,
                fork_version: fixed_bytes!("05000064"),
            },
            fulu: Fork {
                epoch: u64::MAX,
                fork_version: fixed_bytes!("06000064"),
            },
        },
    }
}

fn holesky_config() -> NetworkConfig {
    NetworkConfig {
        genesis_root: b256!("9143aa7c615a7f7115e2b6aac319c03529df8242ae705fba9df39b79c59fa8b1"),
        genesis_time: 1695902400,
        seconds_per_slot: 12,
        forks: Forks {
            genesis: Fork {
                epoch: 0,
                fork_version: fixed_bytes!("01017000"),
            },
            altair: Fork {
                epoch: 0,
                fork_version: fixed_bytes!("02017000"),
            },
            bellatrix: Fork {
                epoch: 0,
                fork_version: fixed_bytes!("03017000"),
            },
            capella: Fork {
                epoch: 256,
                fork_version: fixed_bytes!("04017000"),
            },
            deneb: Fork {
                epoch: 29696,
                fork_version: fixed_bytes!("05017000"),
            },
            electra: Fork {
                epoch: 115968,
                fork_version: fixed_bytes!("06017000"),
            },
            fulu: Fork {
                epoch: 165120,
                fork_version: fixed_bytes!("07017000"),
            },
        },
    }
}

fn hoodi_config() -> NetworkConfig {
    NetworkConfig {
        genesis_root: b256!("212f13fc4df078b6cb7db228f1c8307566dcecf900867401a92023d7ba99cb5f"),
        genesis_time: 1742213400,
        seconds_per_slot: 12,
        forks: Forks {
            genesis: Fork {
                epoch: 0,
                fork_version: fixed_bytes!("10000910"),
            },
            altair: Fork {
                epoch: 0,
                fork_version: fixed_bytes!("20000910"),
            },
            bellatrix: Fork {
                epoch: 0,
                fork_version: fixed_bytes!("30000910"),
            },
            capella: Fork {
                epoch: 0,
                fork_version: fixed_bytes!("40000910"),
            },
            deneb: Fork {
                epoch: 0,
                fork_version: fixed_bytes!("50000910"),
            },
            electra: Fork {
                epoch: 2048,
                fork_version: fixed_bytes!("60000910"),
            },
            fulu: Fork {
                epoch: 50688,
                fork_version: fixed_bytes!("70000910"),
            },
        },
    }
}

fn parse_network(network: &str) -> Result<ConsensusNetwork, String> {
    match network {
        "mainnet" => Ok(ConsensusNetwork::Mainnet),
        "sepolia" => Ok(ConsensusNetwork::Sepolia),
        "holesky" => Ok(ConsensusNetwork::Holesky),
        "hoodi" => Ok(ConsensusNetwork::Hoodi),
        "gnosis" | "xdai" => Ok(ConsensusNetwork::Gnosis),
        _ => Err(format!(
            "Unsupported network for consensus verification: {}. Only mainnet, sepolia, holesky, hoodi, and gnosis are currently supported.",
            network
        )),
    }
}

const ERR_UNSUPPORTED_NETWORK: &str = "unsupported-network";
const ERR_UNSUPPORTED_CONSENSUS_MODE: &str = "unsupported-consensus-mode";
const ERR_INVALID_CHECKPOINT: &str = "invalid-checkpoint-hash";
const ERR_INVALID_BOOTSTRAP: &str = "invalid-bootstrap-json";
const ERR_BOOTSTRAP_VERIFICATION_FAILED: &str = "bootstrap-verification-failed";
const ERR_INVALID_UPDATE: &str = "invalid-update-json";
const ERR_UPDATE_VERIFICATION_FAILED: &str = "update-verification-failed";
const ERR_INVALID_FINALITY_UPDATE: &str = "invalid-finality-update-json";
const ERR_FINALITY_VERIFICATION_FAILED: &str = "finality-verification-failed";
const ERR_MISSING_EXECUTION_PAYLOAD: &str = "missing-execution-payload";
const ERR_INVALID_EXPECTED_STATE_ROOT: &str = "invalid-expected-state-root";
const ERR_STATE_ROOT_MISMATCH: &str = "state-root-mismatch";
const ERR_INVALID_PROOF_PAYLOAD: &str = "invalid-proof-payload";

fn get_network_config(network: ConsensusNetwork) -> NetworkConfig {
    match network {
        ConsensusNetwork::Mainnet => mainnet_config(),
        ConsensusNetwork::Sepolia => sepolia_config(),
        ConsensusNetwork::Holesky => holesky_config(),
        ConsensusNetwork::Hoodi => hoodi_config(),
        ConsensusNetwork::Gnosis => gnosis_config(),
    }
}

#[derive(Default, Clone, Debug, PartialEq, Serialize, Deserialize)]
struct GnosisConsensusSpec;

impl ConsensusSpec for GnosisConsensusSpec {
    type MaxProposerSlashings = U16;
    type MaxAttesterSlashings = U2;
    type MaxAttesterSlashingsElectra = U1;
    type MaxAttestations = U128;
    type MaxAttestationsElectra = U8;
    type MaxValidatorsPerSlot = U131072;
    type MaxCommitteesPerSlot = U64;
    type MaxDeposits = U16;
    type MaxVoluntaryExits = U16;
    type MaxBlsToExecutionChanged = U16;
    type MaxBlobKzgCommitments = U4096;
    type MaxWithdrawals = U16;
    type MaxValidatorsPerCommittee = U2048;
    type SlotsPerEpoch = U16;
    type EpochsPerSyncCommitteePeriod = U512;
    type SyncCommitteeSize = U512;
    type MaxWithdrawalRequests = U16;
    type MaxDepositRequests = U8192;
    type MaxConsolidationRequests = U2;
}

/// Verify a consensus proof from an evidence package.
///
/// This performs the full BLS sync committee verification chain:
/// 1. Verify the bootstrap against the checkpoint
/// 2. Walk the sync committee update chain
/// 3. Verify the finality update
/// 4. Extract the EVM state root from the finalized execution payload
/// 5. Compare it against the claimed state root
pub fn verify_consensus_proof(input: ConsensusProofInput) -> ConsensusVerificationResult {
    if input.consensus_mode != "beacon" {
        return verify_execution_envelope(input);
    }

    let network = match parse_network(&input.network) {
        Ok(network) => network,
        Err(err) => return fail_result(ERR_UNSUPPORTED_NETWORK, err),
    };

    if matches!(network, ConsensusNetwork::Gnosis) {
        return verify_consensus_proof_for_spec::<GnosisConsensusSpec>(input, network);
    }
    verify_consensus_proof_for_spec::<MainnetConsensusSpec>(input, network)
}

fn verify_execution_envelope(input: ConsensusProofInput) -> ConsensusVerificationResult {
    let mut checks = Vec::new();

    let payload_raw = match input.proof_payload.as_deref() {
        Some(payload) => payload,
        None => {
            return fail_result(
                ERR_INVALID_PROOF_PAYLOAD,
                format!(
                    "Missing proofPayload for non-beacon consensus mode '{}'.",
                    input.consensus_mode
                ),
            )
        }
    };

    let payload: Value = match serde_json::from_str(payload_raw) {
        Ok(parsed) => parsed,
        Err(error) => {
            return fail_result(
                ERR_INVALID_PROOF_PAYLOAD,
                format!("Failed to parse proofPayload JSON: {}", error),
            )
        }
    };

    let payload_mode = match payload.get("consensusMode").and_then(Value::as_str) {
        Some(mode) => mode,
        None => {
            return fail_result(
                ERR_INVALID_PROOF_PAYLOAD,
                "proofPayload.consensusMode is missing or not a string.".into(),
            )
        }
    };
    if payload_mode != input.consensus_mode {
        return fail_result(
            ERR_INVALID_PROOF_PAYLOAD,
            format!(
                "proofPayload.consensusMode '{}' does not match package consensusMode '{}'.",
                payload_mode, input.consensus_mode
            ),
        );
    }
    checks.push(ConsensusCheck {
        id: "envelope-mode".into(),
        label: "Envelope consensus mode matches package metadata".into(),
        passed: true,
        detail: Some(format!("Mode: {}", payload_mode)),
    });

    let payload_network = match payload.get("chainId").and_then(Value::as_u64) {
        Some(chain_id) => {
            if let Some(package_chain_id) = input.package_chain_id {
                let chain_id_matches = chain_id == package_chain_id;
                checks.push(ConsensusCheck {
                    id: "envelope-chain-id".into(),
                    label: "Envelope chainId matches package chainId".into(),
                    passed: chain_id_matches,
                    detail: Some(format!(
                        "Envelope: {}, package: {}",
                        chain_id, package_chain_id
                    )),
                });
                if !chain_id_matches {
                    return fail_result(
                        ERR_INVALID_PROOF_PAYLOAD,
                        "Envelope chainId does not match package chainId.".into(),
                    );
                }
            }
            chain_id.to_string()
        }
        None => {
            return fail_result(
                ERR_INVALID_PROOF_PAYLOAD,
                "proofPayload.chainId is missing or invalid.".into(),
            )
        }
    };
    checks.push(ConsensusCheck {
        id: "envelope-network".into(),
        label: "Envelope network metadata present".into(),
        passed: true,
        detail: Some(payload_network),
    });

    let block = match payload.get("block") {
        Some(block) => block,
        None => {
            return fail_result(
                ERR_INVALID_PROOF_PAYLOAD,
                "proofPayload.block is missing.".into(),
            )
        }
    };

    let envelope_state_root = match block.get("stateRoot").and_then(Value::as_str) {
        Some(state_root) => state_root.to_string(),
        None => {
            return fail_result(
                ERR_INVALID_PROOF_PAYLOAD,
                "proofPayload.block.stateRoot is missing or invalid.".into(),
            )
        }
    };

    let envelope_number_hex = match block.get("number").and_then(Value::as_str) {
        Some(number) => number,
        None => {
            return fail_result(
                ERR_INVALID_PROOF_PAYLOAD,
                "proofPayload.block.number is missing or invalid.".into(),
            )
        }
    };
    let envelope_block_number = match parse_hex_u64(envelope_number_hex) {
        Ok(number) => number,
        Err(error) => return fail_result(ERR_INVALID_PROOF_PAYLOAD, error),
    };

    let package_root_matches = envelope_state_root.eq_ignore_ascii_case(&input.state_root);
    checks.push(ConsensusCheck {
        id: "envelope-state-root".into(),
        label: "Envelope state root matches package consensusProof.stateRoot".into(),
        passed: package_root_matches,
        detail: Some(format!(
            "Envelope: {}, package: {}",
            envelope_state_root, input.state_root
        )),
    });
    if !package_root_matches {
        return fail_result(
            ERR_INVALID_PROOF_PAYLOAD,
            "Envelope state root does not match package consensusProof.stateRoot.".into(),
        );
    }

    let package_block_matches = envelope_block_number == input.block_number;
    checks.push(ConsensusCheck {
        id: "envelope-block-number".into(),
        label: "Envelope block number matches package consensusProof.blockNumber".into(),
        passed: package_block_matches,
        detail: Some(format!(
            "Envelope: {}, package: {}",
            envelope_block_number, input.block_number
        )),
    });
    if !package_block_matches {
        return fail_result(
            ERR_INVALID_PROOF_PAYLOAD,
            "Envelope block number does not match package consensusProof.blockNumber.".into(),
        );
    }

    let expected_state_root = match parse_b256(&input.expected_state_root) {
        Ok(root) => format!("{:#x}", root),
        Err(error) => {
            return fail_result(
                ERR_INVALID_EXPECTED_STATE_ROOT,
                format!(
                    "Invalid expected state root from onchainPolicyProof.stateRoot: {}",
                    error
                ),
            )
        }
    };

    let state_root_matches = envelope_state_root.eq_ignore_ascii_case(&expected_state_root);
    checks.push(ConsensusCheck {
        id: "state-root-match".into(),
        label: "Envelope state root matches independent policy root".into(),
        passed: state_root_matches,
        detail: if state_root_matches {
            Some("Envelope root matches onchainPolicyProof.stateRoot.".into())
        } else {
            Some(format!(
                "Mismatch: envelope says {} but onchainPolicyProof.stateRoot is {}.",
                envelope_state_root, expected_state_root
            ))
        },
    });

    ConsensusVerificationResult {
        valid: false,
        verified_state_root: Some(envelope_state_root),
        verified_block_number: Some(envelope_block_number),
        state_root_matches,
        sync_committee_participants: 0,
        error: Some(format!(
            "Consensus mode '{}' payload envelope is structurally valid, but cryptographic verification is not implemented in desktop verifier yet.",
            input.consensus_mode
        )),
        error_code: Some(ERR_UNSUPPORTED_CONSENSUS_MODE.into()),
        checks,
    }
}

fn verify_consensus_proof_for_spec<S: ConsensusSpec>(
    input: ConsensusProofInput,
    network: ConsensusNetwork,
) -> ConsensusVerificationResult {
    let mut checks = Vec::new();

    // Parse the checkpoint
    let checkpoint_raw = match input.checkpoint.as_deref() {
        Some(checkpoint) => checkpoint,
        None => {
            return fail_result(
                ERR_INVALID_CHECKPOINT,
                "Missing checkpoint for beacon consensus proof.".into(),
            );
        }
    };
    let checkpoint = match parse_b256(checkpoint_raw) {
        Ok(c) => c,
        Err(e) => {
            return fail_result(
                ERR_INVALID_CHECKPOINT,
                format!("Invalid checkpoint hash: {}", e),
            );
        }
    };

    // Get network config
    let config = get_network_config(network);

    // Parse bootstrap
    let bootstrap_raw = match input.bootstrap.as_deref() {
        Some(bootstrap) => bootstrap,
        None => {
            return fail_result(
                ERR_INVALID_BOOTSTRAP,
                "Missing bootstrap for beacon consensus proof.".into(),
            );
        }
    };
    let bootstrap: Bootstrap<S> = match serde_json::from_str(bootstrap_raw) {
        Ok(b) => b,
        Err(e) => {
            return fail_result(
                ERR_INVALID_BOOTSTRAP,
                format!("Failed to parse bootstrap: {}", e),
            );
        }
    };

    // Verify bootstrap
    match verify_bootstrap::<S>(&bootstrap, checkpoint, &config.forks) {
        Ok(()) => {
            checks.push(ConsensusCheck {
                id: "bootstrap".into(),
                label: "Bootstrap verification".into(),
                passed: true,
                detail: Some(
                    "Bootstrap header hash matches checkpoint and sync committee proof is valid."
                        .into(),
                ),
            });
        }
        Err(e) => {
            checks.push(ConsensusCheck {
                id: "bootstrap".into(),
                label: "Bootstrap verification".into(),
                passed: false,
                detail: Some(format!("Bootstrap verification failed: {}", e)),
            });
            return ConsensusVerificationResult {
                valid: false,
                verified_state_root: None,
                verified_block_number: None,
                state_root_matches: false,
                sync_committee_participants: 0,
                error: Some(format!("Bootstrap verification failed: {}", e)),
                error_code: Some(ERR_BOOTSTRAP_VERIFICATION_FAILED.into()),
                checks,
            };
        }
    }

    // Apply bootstrap to initialize the light client store
    let mut store = LightClientStore::default();
    apply_bootstrap(&mut store, &bootstrap);

    checks.push(ConsensusCheck {
        id: "store-init".into(),
        label: "Light client store initialized".into(),
        passed: true,
        detail: Some(format!(
            "Store initialized at slot {}.",
            store.finalized_header.beacon().slot
        )),
    });

    // Compute expected current slot
    let current_slot = expected_current_slot_for_network(
        SystemTime::now(),
        config.genesis_time,
        config.seconds_per_slot,
    );

    // Parse and verify updates
    let mut update_count = 0;
    for (i, update_json) in input.updates.as_deref().unwrap_or(&[]).iter().enumerate() {
        let update: Update<S> = match serde_json::from_str(update_json) {
            Ok(u) => u,
            Err(e) => {
                let error = Some(format!("Failed to parse update {}: {}", i, e));
                let error_code = Some(ERR_INVALID_UPDATE.into());
                checks.push(ConsensusCheck {
                    id: format!("update-{}", i),
                    label: format!("Sync committee update #{}", i + 1),
                    passed: false,
                    detail: Some(format!("Parse error: {}", e)),
                });
                return ConsensusVerificationResult {
                    valid: false,
                    verified_state_root: None,
                    verified_block_number: None,
                    state_root_matches: false,
                    sync_committee_participants: 0,
                    error,
                    error_code,
                    checks,
                };
            }
        };

        match verify_update::<S>(
            &update,
            current_slot,
            &store,
            config.genesis_root,
            &config.forks,
        ) {
            Ok(()) => {
                apply_update(&mut store, &update);
                update_count += 1;
            }
            Err(e) => {
                let error = Some(format!("Update {} verification failed: {}", i, e));
                let error_code = Some(ERR_UPDATE_VERIFICATION_FAILED.into());
                checks.push(ConsensusCheck {
                    id: format!("update-{}", i),
                    label: format!("Sync committee update #{}", i + 1),
                    passed: false,
                    detail: Some(format!("Verification failed: {}", e)),
                });
                return ConsensusVerificationResult {
                    valid: false,
                    verified_state_root: None,
                    verified_block_number: None,
                    state_root_matches: false,
                    sync_committee_participants: 0,
                    error,
                    error_code,
                    checks,
                };
            }
        }
    }

    if update_count > 0 {
        checks.push(ConsensusCheck {
            id: "updates".into(),
            label: "Sync committee updates".into(),
            passed: true,
            detail: Some(format!(
                "{} sync committee update(s) verified and applied.",
                update_count
            )),
        });
    }

    // Parse and verify finality update
    let finality_update_raw = match input.finality_update.as_deref() {
        Some(finality_update) => finality_update,
        None => {
            return fail_result(
                ERR_INVALID_FINALITY_UPDATE,
                "Missing finality update for beacon consensus proof.".into(),
            );
        }
    };
    let finality_update: FinalityUpdate<S> = match serde_json::from_str(finality_update_raw) {
        Ok(f) => f,
        Err(e) => {
            return fail_result(
                ERR_INVALID_FINALITY_UPDATE,
                format!("Failed to parse finality update: {}", e),
            );
        }
    };

    // Count sync committee participants
    let participants =
        helios_consensus_core::get_bits::<S>(&finality_update.sync_aggregate().sync_committee_bits);

    match verify_finality_update::<S>(
        &finality_update,
        current_slot,
        &store,
        config.genesis_root,
        &config.forks,
    ) {
        Ok(()) => {
            checks.push(ConsensusCheck {
                id: "finality".into(),
                label: "Finality update verification".into(),
                passed: true,
                detail: Some(format!(
                    "BLS sync committee signature valid. {}/512 validators participated.",
                    participants
                )),
            });
        }
        Err(e) => {
            checks.push(ConsensusCheck {
                id: "finality".into(),
                label: "Finality update verification".into(),
                passed: false,
                detail: Some(format!("Finality verification failed: {}", e)),
            });
            return ConsensusVerificationResult {
                valid: false,
                verified_state_root: None,
                verified_block_number: None,
                state_root_matches: false,
                sync_committee_participants: participants,
                error: Some(format!("Finality verification failed: {}", e)),
                error_code: Some(ERR_FINALITY_VERIFICATION_FAILED.into()),
                checks,
            };
        }
    }

    // Apply finality update to get the verified finalized header
    apply_finality_update(&mut store, &finality_update);

    // Extract the execution state root from the verified finalized header
    let execution = match store.finalized_header.execution() {
        Ok(exec) => exec,
        Err(_) => {
            return fail_result(
                ERR_MISSING_EXECUTION_PAYLOAD,
                "Finalized header does not contain an execution payload (pre-Capella).".into(),
            );
        }
    };

    let verified_state_root = format!("{:#x}", execution.state_root());
    let verified_block_number = *execution.block_number();

    // Compare against independently sourced expected state root
    let expected_state_root = match parse_b256(&input.expected_state_root) {
        Ok(root) => format!("{:#x}", root),
        Err(e) => {
            return fail_result(
                ERR_INVALID_EXPECTED_STATE_ROOT,
                format!(
                    "Invalid expected state root from onchainPolicyProof.stateRoot: {}",
                    e
                ),
            );
        }
    };
    let state_root_matches = verified_state_root.eq_ignore_ascii_case(&expected_state_root);

    checks.push(ConsensusCheck {
        id: "state-root".into(),
        label: "State root extraction".into(),
        passed: true,
        detail: Some(format!(
            "Extracted state root {} from finalized block {}.",
            verified_state_root, verified_block_number
        )),
    });

    checks.push(ConsensusCheck {
        id: "state-root-match".into(),
        label: "State root matches independent policy root".into(),
        passed: state_root_matches,
        detail: if state_root_matches {
            Some("The consensus-verified state root matches onchainPolicyProof.stateRoot.".into())
        } else {
            Some(format!(
                "Mismatch: consensus says {} but onchainPolicyProof.stateRoot is {}.",
                verified_state_root, expected_state_root
            ))
        },
    });

    let mismatch_error = if state_root_matches {
        None
    } else {
        Some(format!(
            "State root mismatch: Helios verified {} but onchainPolicyProof.stateRoot is {}.",
            verified_state_root, expected_state_root
        ))
    };

    ConsensusVerificationResult {
        valid: state_root_matches,
        verified_state_root: Some(verified_state_root),
        verified_block_number: Some(verified_block_number),
        state_root_matches,
        sync_committee_participants: participants,
        error: mismatch_error,
        error_code: if state_root_matches {
            None
        } else {
            Some(ERR_STATE_ROOT_MISMATCH.into())
        },
        checks,
    }
}

fn fail_result(error_code: &str, error: String) -> ConsensusVerificationResult {
    ConsensusVerificationResult {
        valid: false,
        verified_state_root: None,
        verified_block_number: None,
        state_root_matches: false,
        sync_committee_participants: 0,
        error: Some(error),
        error_code: Some(error_code.into()),
        checks: vec![],
    }
}

fn parse_b256(s: &str) -> Result<B256, String> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    let bytes = hex::decode(s).map_err(|e| format!("hex decode: {}", e))?;
    if bytes.len() != 32 {
        return Err(format!("expected 32 bytes, got {}", bytes.len()));
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(B256::from(arr))
}

fn parse_hex_u64(value: &str) -> Result<u64, String> {
    let trimmed = value.strip_prefix("0x").unwrap_or(value);
    if trimmed.is_empty() {
        return Err("Invalid proofPayload.block.number: empty hex value.".into());
    }
    u64::from_str_radix(trimmed, 16)
        .map_err(|error| format!("Invalid proofPayload.block.number hex value: {}", error))
}

fn expected_current_slot_for_network(
    now: SystemTime,
    genesis_time: u64,
    seconds_per_slot: u64,
) -> u64 {
    let now = now.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let since_genesis = now.saturating_sub(genesis_time);
    since_genesis / seconds_per_slot
}

#[cfg(test)]
mod tests {
    use super::{
        expected_current_slot_for_network, get_network_config, parse_b256, parse_network,
        verify_consensus_proof, ConsensusNetwork, ConsensusProofInput, ERR_INVALID_CHECKPOINT,
        ERR_INVALID_PROOF_PAYLOAD, ERR_UNSUPPORTED_CONSENSUS_MODE, ERR_UNSUPPORTED_NETWORK,
    };
    use std::time::{Duration, UNIX_EPOCH};

    #[test]
    fn parse_b256_accepts_prefixed_hex() {
        let parsed =
            parse_b256("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                .expect("valid b256");
        assert_eq!(
            format!("{:#x}", parsed),
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        );
    }

    #[test]
    fn parse_b256_rejects_invalid_length() {
        let err = parse_b256("0x1234").expect_err("invalid length must fail");
        assert!(err.contains("expected 32 bytes"));
    }

    #[test]
    fn supports_gnosis_network_config() {
        let config = get_network_config(parse_network("gnosis").expect("gnosis must be supported"));
        assert_eq!(config.genesis_time, 1638993340);
        assert_eq!(config.seconds_per_slot, 5);
        assert_eq!(config.forks.altair.epoch, 512);
        assert_eq!(
            format!("{:#x}", config.genesis_root),
            "0xf5dcb5564e829aab27264b9becd5dfaa017085611224cb3036f573368dbb9d47"
        );
    }

    #[test]
    fn supports_holesky_network_config() {
        let config =
            get_network_config(parse_network("holesky").expect("holesky must be supported"));
        assert_eq!(config.genesis_time, 1695902400);
        assert_eq!(config.seconds_per_slot, 12);
        assert_eq!(config.forks.capella.epoch, 256);
        assert_eq!(
            format!("{:#x}", config.genesis_root),
            "0x9143aa7c615a7f7115e2b6aac319c03529df8242ae705fba9df39b79c59fa8b1"
        );
    }

    #[test]
    fn supports_hoodi_network_config() {
        let config = get_network_config(parse_network("hoodi").expect("hoodi must be supported"));
        assert_eq!(config.genesis_time, 1742213400);
        assert_eq!(config.seconds_per_slot, 12);
        assert_eq!(config.forks.electra.epoch, 2048);
        assert_eq!(
            format!("{:#x}", config.genesis_root),
            "0x212f13fc4df078b6cb7db228f1c8307566dcecf900867401a92023d7ba99cb5f"
        );
    }

    #[test]
    fn supports_xdai_alias_for_gnosis() {
        let network = parse_network("xdai").expect("xdai alias must resolve");
        assert!(matches!(network, ConsensusNetwork::Gnosis));
    }

    #[test]
    fn rejects_unsupported_networks() {
        let err = parse_network("polygon").expect_err("polygon should fail in desktop verifier");
        assert!(
            err.contains("Unsupported network for consensus verification"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn slot_calculation_respects_seconds_per_slot() {
        let now = UNIX_EPOCH + Duration::from_secs(100);
        assert_eq!(expected_current_slot_for_network(now, 0, 5), 20);
        assert_eq!(expected_current_slot_for_network(now, 0, 12), 8);
    }

    #[test]
    fn returns_machine_readable_error_code_for_unsupported_network() {
        let result = verify_consensus_proof(ConsensusProofInput {
            checkpoint: Some(
                "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
            ),
            bootstrap: Some("{}".to_string()),
            updates: Some(vec![]),
            finality_update: Some("{}".to_string()),
            consensus_mode: "beacon".to_string(),
            network: "polygon".to_string(),
            proof_payload: None,
            state_root: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                .to_string(),
            expected_state_root:
                "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
            block_number: 0,
            package_chain_id: None,
        });

        assert!(!result.valid);
        assert_eq!(result.error_code.as_deref(), Some(ERR_UNSUPPORTED_NETWORK));
    }

    #[test]
    fn returns_machine_readable_error_code_for_invalid_checkpoint() {
        let result = verify_consensus_proof(ConsensusProofInput {
            checkpoint: Some("0x1234".to_string()),
            bootstrap: Some("{}".to_string()),
            updates: Some(vec![]),
            finality_update: Some("{}".to_string()),
            consensus_mode: "beacon".to_string(),
            network: "mainnet".to_string(),
            proof_payload: None,
            state_root: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                .to_string(),
            expected_state_root:
                "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
            block_number: 0,
            package_chain_id: None,
        });

        assert!(!result.valid);
        assert_eq!(result.error_code.as_deref(), Some(ERR_INVALID_CHECKPOINT));
    }

    #[test]
    fn returns_machine_readable_error_code_for_unsupported_consensus_mode() {
        let result = verify_consensus_proof(ConsensusProofInput {
            checkpoint: None,
            bootstrap: None,
            updates: None,
            finality_update: None,
            consensus_mode: "opstack".to_string(),
            network: "optimism".to_string(),
            proof_payload: Some(
                "{\"schema\":\"execution-block-header-v1\",\"consensusMode\":\"opstack\",\"chainId\":10,\"block\":{\"number\":\"0x1\",\"stateRoot\":\"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}}".to_string(),
            ),
            state_root: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                .to_string(),
            expected_state_root:
                "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
            block_number: 1,
            package_chain_id: Some(10),
        });

        assert!(!result.valid);
        assert_eq!(
            result.error_code.as_deref(),
            Some(ERR_UNSUPPORTED_CONSENSUS_MODE)
        );
        assert_eq!(result.verified_block_number, Some(1));
        assert_eq!(
            result.verified_state_root.as_deref(),
            Some("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        );
        assert!(result
            .checks
            .iter()
            .any(|check| check.id == "envelope-state-root" && check.passed));
    }

    #[test]
    fn rejects_non_beacon_envelope_chain_id_mismatch() {
        let result = verify_consensus_proof(ConsensusProofInput {
            checkpoint: None,
            bootstrap: None,
            updates: None,
            finality_update: None,
            consensus_mode: "opstack".to_string(),
            network: "optimism".to_string(),
            proof_payload: Some(
                "{\"schema\":\"execution-block-header-v1\",\"consensusMode\":\"opstack\",\"chainId\":10,\"block\":{\"number\":\"0x1\",\"stateRoot\":\"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}}".to_string(),
            ),
            state_root: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                .to_string(),
            expected_state_root:
                "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
            block_number: 1,
            package_chain_id: Some(8453),
        });

        assert!(!result.valid);
        assert_eq!(
            result.error_code.as_deref(),
            Some(ERR_INVALID_PROOF_PAYLOAD)
        );
        assert_eq!(
            result.error.as_deref(),
            Some("Envelope chainId does not match package chainId.")
        );
    }
}
