use crate::AppState;
use hm_application::recording::RecordingService;
use hm_core::MaterialTarget;
use hm_runtime::platform::{DriverError, RecordingState as CaptureState, RecordingSupport};
use hm_runtime::Capability;
use std::sync::Mutex;
use tauri::State;

pub struct RecordingState(pub Mutex<RecordingService>);
fn capture<T>(
    state: &RecordingState,
    action: impl FnOnce(&mut RecordingService) -> Result<T, DriverError>,
) -> Result<T, DriverError> {
    let mut service = state
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("recording_unavailable"))?;
    action(&mut service)
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
) -> Result<CaptureBackends, DriverError> {
    capture(&state, |service| {
        Ok(CaptureBackends {
            native: service.support(),
            webview_fallback: cfg!(desktop),
        })
    })
}
#[tauri::command(async)]
pub fn start_native_recording(state: State<'_, RecordingState>) -> Result<(), DriverError> {
    capture(&state, |service| service.start())
}
#[tauri::command(async)]
pub fn pause_native_recording(state: State<'_, RecordingState>) -> Result<(), DriverError> {
    capture(&state, |service| service.pause())
}
#[tauri::command(async)]
pub fn resume_native_recording(state: State<'_, RecordingState>) -> Result<(), DriverError> {
    capture(&state, |service| service.resume())
}
#[tauri::command(async)]
pub fn finish_native_recording(state: State<'_, RecordingState>) -> Result<String, DriverError> {
    capture(&state, |service| service.finish())
}
#[tauri::command(async)]
pub fn cancel_native_recording(state: State<'_, RecordingState>) -> Result<(), DriverError> {
    capture(&state, |service| service.cancel())
}
#[tauri::command(async)]
pub fn native_recording_state(
    state: State<'_, RecordingState>,
) -> Result<Option<CaptureState>, DriverError> {
    capture(&state, |service| Ok(service.state()))
}
#[tauri::command(async)]
pub fn archive_native_recording(
    recording: State<'_, RecordingState>,
    state: State<'_, AppState>,
    target: MaterialTarget,
    name: String,
) -> Result<String, DriverError> {
    let mut service = recording
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("recording_unavailable"))?;
    let store = state
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("storage_unavailable"))?;
    service.archive(&store, &target, &name)
}

#[tauri::command(async)]
pub fn save_recording(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    request: tauri::ipc::Request<'_>,
) -> Result<String, DriverError> {
    platform.manifest().require(Capability::RecordAudio)?;
    let headers = request.headers();
    let target: MaterialTarget = serde_json::from_str(
        headers
            .get("x-hm-target")
            .ok_or_else(|| DriverError::invalid_state("recording_target_missing"))?
            .to_str()
            .map_err(|_| DriverError::invalid_state("recording_target_invalid"))?,
    )
    .map_err(|_| DriverError::invalid_state("recording_target_invalid"))?;
    let encoded = headers
        .get("x-hm-name")
        .ok_or_else(|| DriverError::invalid_state("recording_name_missing"))?
        .to_str()
        .map_err(|_| DriverError::invalid_state("recording_name_invalid"))?;
    let name: String = serde_json::from_str(encoded)
        .map_err(|_| DriverError::invalid_state("recording_name_invalid"))?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(DriverError::invalid_state("recording_data_invalid"));
    };
    Ok(access(&state, |s| s.save_recording(target, &name, bytes))?)
}
