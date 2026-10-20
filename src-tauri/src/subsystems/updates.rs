use crate::{access, AppState};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    checking: AtomicBool,
    available: Mutex<Option<UpdateInfo>>,
    pending: Mutex<Option<Update>>,
}

pub(super) fn configure(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.plugin(tauri_plugin_updater::Builder::new().build())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    notes: Option<String>,
}
#[tauri::command]
pub async fn check_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    fetch_update(&app).await
}
#[tauri::command]
pub fn get_update_status(state: State<'_, UpdateState>) -> Result<Option<UpdateInfo>, String> {
    Ok(state
        .available
        .lock()
        .map_err(|_| "更新状态不可用")?
        .clone())
}
struct CheckGuard<'a>(&'a AtomicBool);
impl Drop for CheckGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
pub(super) async fn fetch_update(app: &tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    let state = app.state::<UpdateState>();
    if state.checking.swap(true, Ordering::AcqRel) {
        return Err("正在检查更新，请稍候".into());
    }
    let _guard = CheckGuard(&state.checking);
    let custom = access(&app.state::<AppState>(), |s| s.setting("update_endpoint"))?;
    let mut endpoints = Vec::new();
    if let Some(custom) = custom.filter(|s| !s.is_empty()) {
        endpoints.push(tauri::Url::parse(&custom).map_err(|_| "更新源地址无效")?);
    }
    endpoints.push(
        tauri::Url::parse("https://github.com/limushu/new_hm/releases/latest/download/latest.json")
            .map_err(|e| e.to_string())?,
    );
    let update = app
        .updater_builder()
        .endpoints(endpoints)
        .map_err(|e| e.to_string())?
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| format!("暂时无法连接更新服务：{e}"))?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        notes: u.body.clone(),
    });
    *state.pending.lock().map_err(|_| "更新状态不可用")? = update;
    *state.available.lock().map_err(|_| "更新状态不可用")? = info.clone();
    let _ = app.emit("update-available", &info);
    Ok(info)
}
#[tauri::command]
pub async fn install_update(
    app: tauri::AppHandle,
    state: State<'_, UpdateState>,
    store: State<'_, AppState>,
    location: State<'_, hm_core::StorageLocation>,
    confirmed: bool,
) -> Result<(), String> {
    if !confirmed {
        return Err("安装更新需要确认".into());
    }
    if location.portable {
        return Err("历史绿色模式请先备份，安装新版后恢复备份；安装版随后支持在线更新。".into());
    }
    // Make a recoverable checkpoint before the installer replaces application files.
    access(&store, |s| {
        let settings = s.settings()?;
        let path = settings
            .get("backup_directory")
            .map(std::path::PathBuf::from)
            .unwrap_or(
                app.path()
                    .app_local_data_dir()
                    .map_err(|e| hm_core::Error::Validation(e.to_string()))?
                    .join("backups"),
            );
        s.create_backup(&path, true).map(|_| ())
    })?;
    let update = state
        .pending
        .lock()
        .map_err(|_| "更新状态不可用")?
        .take()
        .ok_or("请先检查更新")?;
    let mut downloaded = 0usize;
    update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk;
                let _ = app.emit(
                    "update-progress",
                    serde_json::json!({"downloaded":downloaded,"total":total}),
                );
            },
            || {},
        )
        .await
        .map_err(|e| format!("更新未安装，现有数据保留：{e}"))?;
    app.restart();
}
pub(super) fn setup(
    app: &mut tauri::App,
    workers: &hm_runtime::WorkerScope,
) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(UpdateState::default());
    let handle = app.handle().clone();
    workers.spawn_periodic(
        std::time::Duration::from_secs(15),
        std::time::Duration::from_secs(6 * 60 * 60),
        move || {
            // Manual checks report errors; background checks remain quiet.
            let _ = tauri::async_runtime::block_on(fetch_update(&handle));
        },
    )?;
    Ok(())
}
