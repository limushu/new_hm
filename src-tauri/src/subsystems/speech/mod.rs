use crate::AppState;
use hm_application::speech::{audio_source, SpeechService};
use hm_runtime::platform::{DriverError, SpeechSnapshot, SpeechSupport};
use std::sync::Mutex;
use tauri::State;

pub struct SpeechState(pub Mutex<SpeechService>);
fn service<T>(
    state: &SpeechState,
    action: impl FnOnce(&mut SpeechService) -> Result<T, DriverError>,
) -> Result<T, DriverError> {
    let mut service = state
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("speech_unavailable"))?;
    action(&mut service)
}
#[tauri::command(async)]
pub fn speech_support(
    state: State<'_, SpeechState>,
    language: String,
) -> Result<SpeechSupport, DriverError> {
    service(&state, |s| s.support(&language))
}
#[tauri::command(async)]
pub fn start_transcription(
    speech: State<'_, SpeechState>,
    state: State<'_, AppState>,
    id: String,
    material_id: String,
    language: String,
) -> Result<SpeechSnapshot, DriverError> {
    let source = {
        let store = state
            .0
            .lock()
            .map_err(|_| DriverError::invalid_state("storage_unavailable"))?;
        audio_source(&store, &material_id)?
    }; // Never hold the workspace lock during staging, authorization or recognition.
    service(&speech, |s| s.start(&id, source, &language))
}
#[tauri::command(async)]
pub fn transcription_state(
    state: State<'_, SpeechState>,
    id: String,
) -> Result<SpeechSnapshot, DriverError> {
    service(&state, |s| s.snapshot(&id))
}
#[tauri::command(async)]
pub fn cancel_transcription(
    state: State<'_, SpeechState>,
    id: String,
) -> Result<SpeechSnapshot, DriverError> {
    service(&state, |s| s.cancel(&id))
}
#[tauri::command(async)]
pub fn discard_transcription(state: State<'_, SpeechState>, id: String) -> Result<(), DriverError> {
    service(&state, |s| s.discard(&id))
}
#[tauri::command(async)]
pub fn save_transcription(
    speech: State<'_, SpeechState>,
    state: State<'_, AppState>,
    id: String,
    document_id: String,
    name: String,
    body: String,
) -> Result<String, DriverError> {
    service(&speech, |s| {
        let store = state
            .0
            .lock()
            .map_err(|_| DriverError::invalid_state("storage_unavailable"))?;
        s.archive(&store, &id, &document_id, &name, &body)
    })
}
