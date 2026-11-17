use crate::platforms::NativeDrivers;
use crate::{access, AppState};
use hm_application::backup::{BackupCandidate, BackupExport, BackupService, BackupSummary};
use hm_core::BackupInfo;
use hm_runtime::platform::DriverError;
use hm_runtime::Capability;
use std::{path::PathBuf, sync::Mutex};
use tauri::State;

pub struct BackupState(pub Mutex<BackupService>);

#[tauri::command(async)]
pub fn choose_backup_directory(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    dialog_title: String,
) -> Result<Option<String>, DriverError> {
    platform.manifest().require(Capability::BackupTransfer)?;
    let Some(path) = platform.local_filesystem.pick_folder(&dialog_title)? else {
        return Ok(None);
    };
    let path = path.to_string_lossy().into_owned();
    access(&state, |s| s.set_setting("backup_directory", &path))?;
    Ok(Some(path))
}
#[tauri::command(async)]
pub fn run_backup(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
) -> Result<BackupInfo, DriverError> {
    platform.manifest().require(Capability::LocalBackup)?;
    let store = state
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("storage_unavailable"))?;
    let directory = store
        .setting("backup_directory")
        .map_err(hm_application::errors::core_error)?
        .ok_or_else(|| DriverError::invalid_state("backup_directory_missing"))?;
    let info = BackupService::create_local(&store, &PathBuf::from(directory), true)?;
    store
        .set_setting(
            "last_backup_date",
            &chrono::Local::now().format("%Y-%m-%d").to_string(),
        )
        .map_err(hm_application::errors::core_error)?;
    Ok(info)
}

#[tauri::command(async)]
pub fn pick_restore_backup(
    platform: State<'_, NativeDrivers>,
    dialog_title: String,
) -> Result<Option<BackupInfo>, DriverError> {
    platform.manifest().require(Capability::BackupTransfer)?;
    let Some(path) = platform.local_filesystem.pick_folder(&dialog_title)? else {
        return Ok(None);
    };
    hm_core::Store::inspect_backup(&path)
        .map(Some)
        .map_err(|e| DriverError::from(e.to_string()))
}

#[tauri::command(async)]
pub fn export_backup_archive(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    backup: State<'_, BackupState>,
    dialog_title: String,
) -> Result<Option<BackupExport>, DriverError> {
    platform.manifest().require(Capability::BackupFiles)?;
    let service = backup
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("backup_unavailable"))?;
    let archive = {
        let store = state
            .0
            .lock()
            .map_err(|_| DriverError::invalid_state("storage_unavailable"))?;
        BackupService::snapshot(&store)?
    };
    service.export(archive, &dialog_title)
}
#[tauri::command(async)]
pub fn pick_backup_archive(
    platform: State<'_, NativeDrivers>,
    backup: State<'_, BackupState>,
    dialog_title: String,
) -> Result<Option<BackupCandidate>, DriverError> {
    platform.manifest().require(Capability::BackupFiles)?;
    backup
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("backup_unavailable"))?
        .select(&dialog_title)
}
#[tauri::command(async)]
pub fn discard_backup_archive(
    backup: State<'_, BackupState>,
    token: String,
) -> Result<(), DriverError> {
    backup
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("backup_unavailable"))?
        .discard(&token);
    Ok(())
}
#[tauri::command(async)]
pub fn restore_backup_archive(
    app: tauri::AppHandle,
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    backup: State<'_, BackupState>,
    recording: State<'_, super::recording::RecordingState>,
    speech: State<'_, super::speech::SpeechState>,
    token: String,
    confirmed: bool,
) -> Result<BackupSummary, DriverError> {
    platform.manifest().require(Capability::BackupFiles)?;
    if confirmed {
        super::sync::pause(&app, true)?;
    }
    let mut service = backup
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("backup_unavailable"))?;
    // Keep in-flight audio work from being saved into a different workspace.
    let capture = recording
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("recording_unavailable"))?;
    let transcription = speech
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("speech_unavailable"))?;
    if capture.state().is_some() || transcription.has_pending() {
        return Err(DriverError::invalid_state("backup_workspace_busy"));
    }
    let mut store = state
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("storage_unavailable"))?;
    service.restore(&mut store, &token, confirmed)
}
#[tauri::command(async)]
pub fn apply_restore_backup(
    app: tauri::AppHandle,
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    path: PathBuf,
    confirmed: bool,
) -> Result<BackupInfo, DriverError> {
    platform.manifest().require(Capability::BackupTransfer)?;
    if confirmed {
        super::sync::pause(&app, true)?;
    }
    Ok(access(&state, |s| s.restore_backup(&path, confirmed))?)
}
