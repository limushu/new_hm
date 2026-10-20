use crate::platforms::NativeDrivers;
use crate::{access, AppState};
use hm_core::BackupInfo;
use hm_core::{ImportReport, MaterialTarget};
use hm_runtime::Capability;
use std::path::PathBuf;
use tauri::{Manager, State};
#[tauri::command(async)]
pub fn pick_receipt_file(platform: State<'_, NativeDrivers>) -> Result<Option<String>, String> {
    Ok(platform
        .local_filesystem
        .pick_files("选择报销凭据或发票", false)?
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
) -> Result<(), String> {
    platform.manifest().require(Capability::FilePicker)?;
    access(&state, |s| {
        s.save_ledger_with_receipt(input, &source_path, &receipt_id)
    })
}

#[tauri::command(async)]
pub fn pick_materials(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    target: MaterialTarget,
) -> Result<ImportReport, String> {
    let Some(documents) = platform.documents.pick(true).map_err(|e| e.to_string())? else {
        return Ok(ImportReport {
            imported: 0,
            errors: vec![],
        });
    };
    access(&state, |store| {
        hm_application::documents::import_documents(store, &target, documents)
    })
}
#[tauri::command(async)]
pub fn import_material_paths(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    target: MaterialTarget,
    paths: Vec<PathBuf>,
) -> Result<ImportReport, String> {
    platform.manifest().require(Capability::NativeDrop)?;
    #[cfg(desktop)]
    {
        if paths.len() > 500 {
            return Err("单次最多添加500个文件".into());
        }
        let mut report = ImportReport {
            imported: 0,
            errors: vec![],
        };
        for path in paths {
            match crate::platforms::desktop::documents::open_local(path.clone()) {
                Ok(document) => {
                    let imported = access(&state, |store| {
                        hm_application::documents::import_documents(store, &target, vec![document])
                    })?;
                    report.imported += imported.imported;
                    report.errors.extend(imported.errors);
                }
                Err(error) => report.errors.push(format!("{}：{error}", path.display())),
            }
        }
        Ok(report)
    }
    #[cfg(mobile)]
    {
        let _ = (state, target, paths);
        Err("当前驱动不支持路径拖入".into())
    }
}
#[tauri::command(async)]
pub fn material_preview(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<String, String> {
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
        return Err("此文件请使用系统应用打开".into());
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
) -> Result<(), String> {
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
        return Err("此类型请先导出副本，再自行选择打开方式".into());
    }
    platform.external_open.open_file(&path)
}
#[tauri::command(async)]
pub fn export_material(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let item = access(&state, |s| s.material(&id))?;
    let path = access(&state, |s| s.material_path(&id))?;
    let mut source = std::fs::File::open(path).map_err(|e| e.to_string())?;
    platform
        .documents
        .export(&item.name, &mut source)
        .map(|exported| exported.is_some())
        .map_err(|e| e.to_string())
}
#[tauri::command(async)]
pub fn save_recording(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    request: tauri::ipc::Request<'_>,
) -> Result<String, String> {
    platform.manifest().require(Capability::RecordAudio)?;
    let headers = request.headers();
    let target: MaterialTarget = serde_json::from_str(
        headers
            .get("x-hm-target")
            .ok_or("缺少录音归属")?
            .to_str()
            .map_err(|_| "录音归属无效")?,
    )
    .map_err(|e| e.to_string())?;
    let encoded = headers
        .get("x-hm-name")
        .ok_or("缺少录音名称")?
        .to_str()
        .map_err(|_| "录音名称无效")?;
    let name: String = serde_json::from_str(encoded).map_err(|e| e.to_string())?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("录音数据无效".into());
    };
    access(&state, |s| s.save_recording(target, &name, bytes))
}
#[tauri::command(async)]
pub fn choose_backup_directory(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let Some(path) = platform.local_filesystem.pick_folder("选择备份位置")? else {
        return Ok(None);
    };
    let path = path.to_string_lossy().into_owned();
    access(&state, |s| s.set_setting("backup_directory", &path))?;
    Ok(Some(path))
}
#[tauri::command(async)]
pub fn run_backup(state: State<'_, AppState>) -> Result<BackupInfo, String> {
    access(&state, |s| {
        let directory = s
            .setting("backup_directory")?
            .ok_or_else(|| hm_core::Error::Validation("请先选择备份位置".into()))?;
        let info = s.create_backup(&PathBuf::from(directory), true)?;
        s.set_setting(
            "last_backup_date",
            &chrono::Local::now().format("%Y-%m-%d").to_string(),
        )?;
        Ok(info)
    })
}
#[tauri::command(async)]
pub fn pick_restore_backup(
    platform: State<'_, NativeDrivers>,
) -> Result<Option<BackupInfo>, String> {
    let Some(path) = platform
        .local_filesystem
        .pick_folder("选择一个 hm-backup 备份文件夹")?
    else {
        return Ok(None);
    };
    hm_core::Store::inspect_backup(&path)
        .map(Some)
        .map_err(|e| e.to_string())
}
#[tauri::command(async)]
pub fn apply_restore_backup(
    platform: State<'_, NativeDrivers>,
    state: State<'_, AppState>,
    path: PathBuf,
    confirmed: bool,
) -> Result<BackupInfo, String> {
    platform.manifest().require(Capability::BackupTransfer)?;
    access(&state, |s| s.restore_backup(&path, confirmed))
}
