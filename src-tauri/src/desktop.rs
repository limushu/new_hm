use crate::{access, AppState};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::{Update, UpdaterExt};
#[derive(Default)]
pub struct DesktopState {
    checking: AtomicBool,
    available: Mutex<Option<UpdateInfo>>,
    pub pending: Mutex<Option<Update>>,
    pub background: Mutex<BTreeMap<String, String>>,
}
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    notes: Option<String>,
}
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
#[tauri::command]
pub fn autostart_status(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}
#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    }
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn background_status(
    state: State<'_, DesktopState>,
) -> Result<BTreeMap<String, String>, String> {
    state
        .background
        .lock()
        .map(|v| v.clone())
        .map_err(|_| "后台状态不可用".into())
}
#[tauri::command]
pub async fn check_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    fetch_update(&app).await
}
#[tauri::command]
pub fn get_update_status(state: State<'_, DesktopState>) -> Result<Option<UpdateInfo>, String> {
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
async fn fetch_update(app: &tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    let state = app.state::<DesktopState>();
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
    state: State<'_, DesktopState>,
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
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(DesktopState::default());
    // Explicitly set the window icon as well as the executable/installer icons.
    // This also covers the separately-created legacy portable window.
    if let Some(icon) = app.default_window_icon() {
        for window in app.webview_windows().values() {
            window.set_icon(icon.clone())?;
        }
    }
    let updater_handle = app.handle().clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(15));
        loop {
            // Failures stay quiet; the manual update page reports errors on demand.
            let _ = tauri::async_runtime::block_on(fetch_update(&updater_handle));
            std::thread::sleep(std::time::Duration::from_secs(6 * 60 * 60));
        }
    });
    let show = tauri::menu::MenuItem::with_id(app, "show", "打开案笺", true, None::<&str>)?;
    let quit = tauri::menu::MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;
    let mut tray = tauri::tray::TrayIconBuilder::with_id("main")
        .tooltip("案笺 · 后台提醒运行中")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                tauri::tray::TrayIconEvent::Click {
                    button: tauri::tray::MouseButton::Left,
                    button_state: tauri::tray::MouseButtonState::Up,
                    ..
                }
            ) {
                show_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    let handle = app.handle().clone();
    std::thread::spawn(move || loop {
        let result = access(&handle.state::<AppState>(), |s| {
            let now = chrono::Local::now();
            let settings = s.settings()?;
            let mut health = BTreeMap::new();
            if settings.get("last_backup_date") != Some(&now.format("%Y-%m-%d").to_string()) {
                if let Some(directory) = settings.get("backup_directory") {
                    match s.create_backup(std::path::Path::new(directory), true) {
                        Ok(info) => {
                            s.set_setting("last_backup_date", &now.format("%Y-%m-%d").to_string())?;
                            health.insert("lastBackup".into(), info.created_at);
                            health.insert("backupError".into(), String::new());
                        }
                        Err(error) => {
                            health.insert("backupError".into(), error.to_string());
                        }
                    }
                }
            }
            health.insert("notificationError".into(), String::new());
            if settings.get("last_backup_date") == Some(&now.format("%Y-%m-%d").to_string()) {
                health.insert("backupError".into(), String::new());
            }
            if settings.get("notifications").is_none_or(|v| v != "false") {
                for reminder in s.due_reminders(now.naive_local())? {
                    match handle
                        .notification()
                        .builder()
                        .title(&reminder.title)
                        .body(&reminder.when)
                        .show()
                    {
                        Ok(()) => {
                            s.acknowledge_reminder(&reminder.event_id, &reminder.schedule_key)?
                        }
                        Err(error) => {
                            health.insert("notificationError".into(), error.to_string());
                        }
                    }
                }
            }
            Ok(health)
        });
        if let Ok(health) = result {
            if let Ok(mut old) = handle.state::<DesktopState>().background.lock() {
                for (key, value) in health {
                    old.insert(key, value);
                }
                let _ = handle.emit("background-status", old.clone());
            }
        }
        std::thread::sleep(std::time::Duration::from_secs(60));
    });
    Ok(())
}
pub fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
