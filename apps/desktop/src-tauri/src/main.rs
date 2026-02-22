#[cfg(target_os = "macos")]
use tauri::Manager;

mod consensus;
mod simulation_replay;

#[tauri::command]
fn verify_consensus_proof(
    input: consensus::ConsensusProofInput,
) -> Result<consensus::ConsensusVerificationResult, String> {
    Ok(consensus::verify_consensus_proof(input))
}

#[tauri::command]
fn verify_simulation_replay(
    input: simulation_replay::SimulationReplayInput,
) -> Result<simulation_replay::SimulationReplayVerificationResult, String> {
    Ok(simulation_replay::verify_simulation_replay(input))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            verify_consensus_proof,
            verify_simulation_replay
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let window = app.get_webview_window("main").unwrap();
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)
                    .expect("failed to apply vibrancy");
            }

            #[cfg(not(target_os = "macos"))]
            {
                let _ = app;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
