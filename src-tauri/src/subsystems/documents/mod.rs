use crate::platforms::NativeDrivers;
use crate::{access, AppState};
#[cfg(desktop)]
use hm_application::documents::ImportIssue;
use hm_application::documents::ImportReport;
use hm_core::BackupInfo;
use hm_core::MaterialTarget;
use hm_runtime::platform::DriverError;
use hm_runtime::Capability;
use std::path::PathBuf;
use tauri::{Manager, State};
#[tauri::command(async)]
pub fn pick_receipt_file(
    platform: State<'_, NativeDrivers>,
    dialog_title: String,
) -> Result<Option<String>, DriverError> {
    Ok(platform
        .local_filesystem
        .pick_files(&dialog_title, false)?
        .and_then(|files| files.into_iter().next())
        .map(|path| path.to_string_lossy().into_owned()))
}
#[tauri::command(async)]
pub fn save_ledger_with_receipt(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    input: hm_core::LedgerEntry,
    source_path: PathBuf,
    receipt_id: String,
) -> Result<(), DriverError> {
    platform.manifest().require(Capability::FilePicker)?;
    Ok(access(&state, |s| {
        s.save_ledger_with_receipt(input, &source_path, &receipt_id)
    })?)
}

#[tauri::command(async)]
pub fn pick_materials(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    target: MaterialTarget,
    dialog_title: String,
) -> Result<ImportReport, DriverError> {
    let Some(documents) = platform.documents.pick(&dialog_title, true)? else {
        return Ok(ImportReport {
            imported: 0,
            errors: vec![],
        });
    };
    import_selected(&state, &target, documents)
}
#[tauri::command(async)]
pub fn import_material_paths(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    target: MaterialTarget,
    paths: Vec<PathBuf>,
) -> Result<ImportReport, DriverError> {
    platform.manifest().require(Capability::NativeDrop)?;
    #[cfg(desktop)]
    {
        if paths.len() > 500 {
            return Err(DriverError::invalid_state("import_limit_exceeded"));
        }
        let mut report = ImportReport {
            imported: 0,
            errors: vec![],
        };
        for path in paths {
            match crate::platforms::desktop::documents::open_local(path.clone()) {
                Ok(document) => {
                    let imported = import_selected(&state, &target, vec![document])?;
                    report.imported += imported.imported;
                    report.errors.extend(imported.errors);
                }
                Err(error) => report.errors.push(ImportIssue {
                    name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned(),
                    error,
                }),
            }
        }
        Ok(report)
    }
    #[cfg(mobile)]
    {
        let _ = (state, target, paths);
        Err(DriverError::unsupported("native_drop"))
    }
}
#[tauri::command(async)]
pub fn material_preview(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<String, DriverError> {
    let path = access(&state, |s| s.material_path(&id))?;
    let extension = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase();
    if ![
        "pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "webm", "ogg", "mp3", "wav", "m4a",
        "mp4",
    ]
    .contains(&extension.as_str())
    {
        return Err(DriverError::invalid_state("preview_format_unsupported"));
    }
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into())
}
#[tauri::command(async)]
pub fn open_material(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), DriverError> {
    let path = access(&state, |s| s.material_path(&id))?;
    let extension = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase();
    if ![
        "pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "doc", "docx", "xls", "xlsx", "ppt",
        "pptx", "txt", "md", "csv", "rtf", "odt", "ods", "odp", "webm", "ogg", "mp3", "wav", "m4a",
        "mp4",
    ]
    .contains(&extension.as_str())
    {
        return Err(DriverError::invalid_state("external_format_unsupported"));
    }
    platform.external_open.open_file(&path)
}
#[tauri::command(async)]
pub fn export_material(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    id: String,
    dialog_title: String,
) -> Result<bool, DriverError> {
    let item = access(&state, |s| s.material(&id))?;
    let path = access(&state, |s| s.material_path(&id))?;
    let mut source = std::fs::File::open(path)?;
    platform
        .documents
        .export(&dialog_title, &item.name, &mut source)
        .map(|exported| exported.is_some())
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
#[tauri::command(async)]
pub fn choose_backup_directory(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    dialog_title: String,
) -> Result<Option<String>, DriverError> {
    let Some(path) = platform.local_filesystem.pick_folder(&dialog_title)? else {
        return Ok(None);
    };
    let path = path.to_string_lossy().into_owned();
    access(&state, |s| s.set_setting("backup_directory", &path))?;
    Ok(Some(path))
}
#[tauri::command(async)]
pub fn run_backup(state: State<'_, AppState>) -> Result<BackupInfo, DriverError> {
    let store = state
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("storage_unavailable"))?;
    let directory = store
        .setting("backup_directory")
        .map_err(hm_application::errors::core_error)?
        .ok_or_else(|| DriverError::invalid_state("backup_directory_missing"))?;
    let info = store
        .create_backup(&PathBuf::from(directory), true)
        .map_err(hm_application::errors::core_error)?;
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
    let Some(path) = platform.local_filesystem.pick_folder(&dialog_title)? else {
        return Ok(None);
    };
    hm_core::Store::inspect_backup(&path)
        .map(Some)
        .map_err(|e| DriverError::from(e.to_string()))
}
#[tauri::command(async)]
pub fn apply_restore_backup(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    path: PathBuf,
    confirmed: bool,
) -> Result<BackupInfo, DriverError> {
    platform.manifest().require(Capability::BackupTransfer)?;
    Ok(access(&state, |s| s.restore_backup(&path, confirmed))?)
}

fn import_selected(
    state: &AppState,
    target: &MaterialTarget,
    documents: Vec<Box<dyn hm_runtime::platform::Document>>,
) -> Result<ImportReport, DriverError> {
    let store = state
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("storage_unavailable"))?;
    hm_application::documents::import_documents(&store, target, documents)
}
