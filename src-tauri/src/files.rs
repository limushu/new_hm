use crate::{access, AppState};
use hm_core::{BackupInfo, ImportReport, MaterialTarget};
use std::path::PathBuf;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
#[tauri::command(async)]
pub fn pick_receipt_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    app.dialog()
        .file()
        .set_title("选择报销凭据或发票")
        .blocking_pick_file()
        .map(|file| {
            file.into_path()
                .map(|p| p.to_string_lossy().into_owned())
                .map_err(|e| e.to_string())
        })
        .transpose()
}
#[tauri::command(async)]
pub fn save_ledger_with_receipt(
    state: State<'_, AppState>,
    input: hm_core::LedgerEntry,
    source_path: PathBuf,
    receipt_id: String,
) -> Result<(), String> {
    access(&state, |s| {
        s.save_ledger_with_receipt(input, &source_path, &receipt_id)
    })
}

#[tauri::command(async)]
pub fn pick_materials(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    target: MaterialTarget,
) -> Result<ImportReport, String> {
    let files = app
        .dialog()
        .file()
        .set_title("添加材料（复制归档，原文件保留）")
        .blocking_pick_files();
    let Some(files) = files else {
        return Ok(ImportReport {
            imported: 0,
            errors: vec![],
        });
    };
    let paths = files
        .into_iter()
        .map(|f| f.into_path().map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    access(&state, |s| s.import_materials(target, &paths))
}
#[tauri::command(async)]
pub fn import_material_paths(
    state: State<'_, AppState>,
    target: MaterialTarget,
    paths: Vec<PathBuf>,
) -> Result<ImportReport, String> {
    access(&state, |s| s.import_materials(target, &paths))
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
    app: tauri::AppHandle,
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
    app.opener()
        .open_path(path.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())
}
#[tauri::command(async)]
pub fn export_material(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let item = access(&state, |s| s.material(&id))?;
    let Some(file) = app
        .dialog()
        .file()
        .set_title("导出材料副本")
        .set_file_name(&item.name)
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    access(&state, |s| s.export_material(&id, &path))?;
    Ok(true)
}
#[tauri::command(async)]
pub fn save_recording(
    state: State<'_, AppState>,
    request: tauri::ipc::Request<'_>,
) -> Result<String, String> {
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
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let Some(folder) = app
        .dialog()
        .file()
        .set_title("选择备份位置")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let path = folder
        .into_path()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();
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
pub fn pick_restore_backup(app: tauri::AppHandle) -> Result<Option<BackupInfo>, String> {
    let Some(folder) = app
        .dialog()
        .file()
        .set_title("选择一个 hm-backup 备份文件夹")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let path = folder.into_path().map_err(|e| e.to_string())?;
    hm_core::Store::inspect_backup(&path)
        .map(Some)
        .map_err(|e| e.to_string())
}
#[tauri::command(async)]
pub fn apply_restore_backup(
    state: State<'_, AppState>,
    path: PathBuf,
    confirmed: bool,
) -> Result<BackupInfo, String> {
    access(&state, |s| s.restore_backup(&path, confirmed))
}
