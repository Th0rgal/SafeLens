//! Consensus proof verification using Helios consensus-core.
//!
//! Verifies BLS sync committee signatures over beacon block headers
//! to authenticate the EVM state root. This is a pure computation —
//! no network access needed. All data comes from the evidence package.

use std::time::{SystemTime, UNIX_EPOCH};

use alloy::primitives::{b256, fixed_bytes, B256};
use helios_consensus_core::{
    apply_bootstrap, apply_finality_update, apply_update, verify_bootstrap,
    verify_finality_update, verify_update,
    consensus_spec::{ConsensusSpec, MainnetConsensusSpec},
    types::{
        Bootstrap, FinalityUpdate, Fork, Forks, LightClientStore, Update,
    },
};
use serde::{Deserialize, Serialize};
use typenum::{
    U1, U2, U8, U16, U64, U128, U512, U2048, U4096, U8192, U131072,
};

/// Input from the frontend: the consensus proof section of an evidence package.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsensusProofInput {
    pub checkpoint: String,
    pub bootstrap: String,
    pub updates: Vec<String>,
    pub finality_update: String,
    pub network: String,
    #[allow(dead_code)]
    pub state_root: String,
    pub expected_state_root: String,
    #[allow(dead_code)]
    pub block_number: u64,
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

#[derive(Clone, Copy)]
enum ConsensusNetwork {
    Mainnet,
    Sepolia,
    Gnosis,
}

fn mainnet_config() -> NetworkConfig {
    NetworkConfig {
        genesis_root: b256!("4b363db94e286120d76eb905340fdd4e54bfe9f06bf33ff6cf5ad27f511bfe95"),
        genesis_time: 1606824023,
        seconds_per_slot: 12,
        forks: Forks {
            genesis: Fork { epoch: 0, fork_version: fixed_bytes!("00000000") },
            altair: Fork { epoch: 74240, fork_version: fixed_bytes!("01000000") },
            bellatrix: Fork { epoch: 144896, fork_version: fixed_bytes!("02000000") },
            capella: Fork { epoch: 194048, fork_version: fixed_bytes!("03000000") },
            deneb: Fork { epoch: 269568, fork_version: fixed_bytes!("04000000") },
            electra: Fork { epoch: 364032, fork_version: fixed_bytes!("05000000") },
            fulu: Fork { epoch: 411392, fork_version: fixed_bytes!("06000000") },
        },
    }
}

fn sepolia_config() -> NetworkConfig {
    NetworkConfig {
        genesis_root: b256!("d8ea171f3c94aea21ebc42a1ed61052acf3f9209c00e4efbaaddac09ed9b8078"),
        genesis_time: 1655733600,
        seconds_per_slot: 12,
        forks: Forks {
            genesis: Fork { epoch: 0, fork_version: fixed_bytes!("90000069") },
            altair: Fork { epoch: 50, fork_version: fixed_bytes!("90000070") },
            bellatrix: Fork { epoch: 100, fork_version: fixed_bytes!("90000071") },
            capella: Fork { epoch: 56832, fork_version: fixed_bytes!("90000072") },
            deneb: Fork { epoch: 132608, fork_version: fixed_bytes!("90000073") },
            electra: Fork { epoch: 222464, fork_version: fixed_bytes!("90000074") },
            fulu: Fork { epoch: 272640, fork_version: fixed_bytes!("90000075") },
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
            genesis: Fork { epoch: 0, fork_version: fixed_bytes!("00000064") },
            altair: Fork { epoch: 512, fork_version: fixed_bytes!("01000064") },
            bellatrix: Fork { epoch: 385536, fork_version: fixed_bytes!("02000064") },
            capella: Fork { epoch: 648704, fork_version: fixed_bytes!("03000064") },
            deneb: Fork { epoch: 889856, fork_version: fixed_bytes!("04000064") },
            electra: Fork { epoch: 1337856, fork_version: fixed_bytes!("05000064") },
            fulu: Fork {
                epoch: u64::MAX,
                fork_version: fixed_bytes!("06000064"),
            },
        },
    }
}

fn parse_network(network: &str) -> Result<ConsensusNetwork, String> {
    match network {
        "mainnet" => Ok(ConsensusNetwork::Mainnet),
        "sepolia" => Ok(ConsensusNetwork::Sepolia),
        "gnosis" | "xdai" => Ok(ConsensusNetwork::Gnosis),
        _ => Err(format!(
            "Unsupported network for consensus verification: {}. Only mainnet, sepolia, and gnosis are currently supported.",
            network
        )),
    }
}

fn get_network_config(network: ConsensusNetwork) -> NetworkConfig {
    match network {
        ConsensusNetwork::Mainnet => mainnet_config(),
        ConsensusNetwork::Sepolia => sepolia_config(),
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
    let network = match parse_network(&input.network) {
        Ok(network) => network,
        Err(err) => return fail_result(err),
    };

    if matches!(network, ConsensusNetwork::Gnosis) {
        return verify_consensus_proof_for_spec::<GnosisConsensusSpec>(
            input,
            network,
        );
    }
    verify_consensus_proof_for_spec::<MainnetConsensusSpec>(input, network)
}

fn verify_consensus_proof_for_spec<S: ConsensusSpec>(
    input: ConsensusProofInput,
    network: ConsensusNetwork,
) -> ConsensusVerificationResult {
    let mut checks = Vec::new();
    let mut error = None;

    // Parse the checkpoint
    let checkpoint = match parse_b256(&input.checkpoint) {
        Ok(c) => c,
        Err(e) => {
            return fail_result(format!("Invalid checkpoint hash: {}", e));
        }
    };

    // Get network config
    let config = get_network_config(network);

    // Parse bootstrap
    let bootstrap: Bootstrap<S> = match serde_json::from_str(&input.bootstrap) {
        Ok(b) => b,
        Err(e) => {
            return fail_result(format!("Failed to parse bootstrap: {}", e));
        }
    };

    // Verify bootstrap
    match verify_bootstrap::<S>(&bootstrap, checkpoint, &config.forks) {
        Ok(()) => {
            checks.push(ConsensusCheck {
                id: "bootstrap".into(),
                label: "Bootstrap verification".into(),
                passed: true,
                detail: Some("Bootstrap header hash matches checkpoint and sync committee proof is valid.".into()),
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
    for (i, update_json) in input.updates.iter().enumerate() {
        let update: Update<S> = match serde_json::from_str(update_json) {
            Ok(u) => u,
            Err(e) => {
                error = Some(format!("Failed to parse update {}: {}", i, e));
                checks.push(ConsensusCheck {
                    id: format!("update-{}", i),
                    label: format!("Sync committee update #{}", i + 1),
                    passed: false,
                    detail: Some(format!("Parse error: {}", e)),
                });
                break;
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
                error = Some(format!("Update {} verification failed: {}", i, e));
                checks.push(ConsensusCheck {
                    id: format!("update-{}", i),
                    label: format!("Sync committee update #{}", i + 1),
                    passed: false,
                    detail: Some(format!("Verification failed: {}", e)),
                });
                break;
            }
        }
    }

    if error.is_some() {
        return ConsensusVerificationResult {
            valid: false,
            verified_state_root: None,
            verified_block_number: None,
            state_root_matches: false,
            sync_committee_participants: 0,
            error,
            checks,
        };
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
    let finality_update: FinalityUpdate<S> =
        match serde_json::from_str(&input.finality_update) {
            Ok(f) => f,
            Err(e) => {
                return fail_result(format!("Failed to parse finality update: {}", e));
            }
        };

    // Count sync committee participants
    let participants = helios_consensus_core::get_bits::<S>(
        &finality_update.sync_aggregate().sync_committee_bits,
    );

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
            return fail_result(format!(
                "Invalid expected state root from onchainPolicyProof.stateRoot: {}",
                e
            ));
        }
    };
    let state_root_matches =
        verified_state_root.eq_ignore_ascii_case(&expected_state_root);

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

    ConsensusVerificationResult {
        valid: state_root_matches,
        verified_state_root: Some(verified_state_root),
        verified_block_number: Some(verified_block_number),
        state_root_matches,
        sync_committee_participants: participants,
        error: if state_root_matches {
            None
        } else {
            Some(format!(
                "State root mismatch: Helios verified {} but onchainPolicyProof.stateRoot is {}.",
                verified_state_root, expected_state_root
            ))
        },
        checks,
    }
}

fn fail_result(error: String) -> ConsensusVerificationResult {
    ConsensusVerificationResult {
        valid: false,
        verified_state_root: None,
        verified_block_number: None,
        state_root_matches: false,
        sync_committee_participants: 0,
        error: Some(error),
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
        expected_current_slot_for_network, get_network_config, parse_b256,
        parse_network, ConsensusNetwork,
    };
    use std::time::{Duration, UNIX_EPOCH};

    #[test]
    fn parse_b256_accepts_prefixed_hex() {
        let parsed = parse_b256(
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        )
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
        let config = get_network_config(
            parse_network("gnosis").expect("gnosis must be supported"),
        );
        assert_eq!(config.genesis_time, 1638993340);
        assert_eq!(config.seconds_per_slot, 5);
        assert_eq!(config.forks.altair.epoch, 512);
        assert_eq!(
            format!("{:#x}", config.genesis_root),
            "0xf5dcb5564e829aab27264b9becd5dfaa017085611224cb3036f573368dbb9d47"
        );
    }

    #[test]
    fn supports_xdai_alias_for_gnosis() {
        let network = parse_network("xdai").expect("xdai alias must resolve");
        assert!(matches!(network, ConsensusNetwork::Gnosis));
    }

    #[test]
    fn rejects_unsupported_networks() {
        let err = parse_network("holesky").expect_err("holesky should fail in desktop verifier");
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
}
