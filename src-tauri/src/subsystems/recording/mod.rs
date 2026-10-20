use crate::AppState;
use hm_application::recording::RecordingService;
use hm_core::MaterialTarget;
use hm_runtime::platform::{DriverError, RecordingState as CaptureState, RecordingSupport};
use std::sync::Mutex;
use tauri::State;

pub struct RecordingState(pub Mutex<RecordingService>);
fn capture<T>(
    state: &RecordingState,
    action: impl FnOnce(&mut RecordingService) -> Result<T, DriverError>,
) -> Result<T, String> {
    let mut service = state.0.lock().map_err(|_| "录音服务不可用")?;
    action(&mut service).map_err(|e| e.to_string())
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureBackends {
    native: RecordingSupport,
    webview_fallback: bool,
}
#[tauri::command]
pub fn native_recording_support(
    state: State<'_, RecordingState>,
) -> Result<CaptureBackends, String> {
    capture(&state, |service| {
        Ok(CaptureBackends {
            native: service.support(),
            webview_fallback: cfg!(desktop),
        })
    })
}
#[tauri::command(async)]
pub fn start_native_recording(state: State<'_, RecordingState>) -> Result<(), String> {
    capture(&state, |service| service.start())
}
#[tauri::command(async)]
pub fn pause_native_recording(state: State<'_, RecordingState>) -> Result<(), String> {
    capture(&state, |service| service.pause())
}
#[tauri::command(async)]
pub fn resume_native_recording(state: State<'_, RecordingState>) -> Result<(), String> {
    capture(&state, |service| service.resume())
}
#[tauri::command(async)]
pub fn finish_native_recording(state: State<'_, RecordingState>) -> Result<String, String> {
    capture(&state, |service| service.finish())
}
#[tauri::command(async)]
pub fn cancel_native_recording(state: State<'_, RecordingState>) -> Result<(), String> {
    capture(&state, |service| service.cancel())
}
#[tauri::command]
pub fn native_recording_state(
    state: State<'_, RecordingState>,
) -> Result<Option<CaptureState>, String> {
    capture(&state, |service| Ok(service.state()))
}
#[tauri::command(async)]
pub fn archive_native_recording(
    recording: State<'_, RecordingState>,
    state: State<'_, AppState>,
    target: MaterialTarget,
    name: String,
) -> Result<String, String> {
    let mut service = recording.0.lock().map_err(|_| "录音服务不可用")?;
    let store = state.0.lock().map_err(|_| "数据库暂时不可用")?;
    service.archive(&store, &target, &name)
}
