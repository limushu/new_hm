use crate::{access, AppState};
use std::collections::BTreeMap;
use tauri::{Manager, State};
#[cfg(desktop)]
use tauri_plugin_notification::NotificationExt;

#[cfg(desktop)]
pub(super) fn configure(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.plugin(tauri_plugin_notification::init())
}

#[tauri::command]
pub fn background_status(
    state: State<'_, super::health::RuntimeHealth>,
) -> Result<BTreeMap<String, String>, String> {
    state.snapshot()
}
#[cfg(desktop)]
pub(super) fn setup(
    app: &mut tauri::App,
    workers: &hm_runtime::WorkerScope,
) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    workers.spawn_periodic(
        std::time::Duration::ZERO,
        std::time::Duration::from_secs(60),
        move || {
            let result = access(&handle.state::<AppState>(), |s| {
                let now = chrono::Local::now();
                let settings = s.settings()?;
                let mut health = backup_health(s, now)?;
                health.insert("notificationError".into(), String::new());
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
            let health = match result {
                Ok(mut health) => {
                    health.insert("maintenanceError".into(), String::new());
                    health
                }
                Err(error) => BTreeMap::from([("maintenanceError".into(), error)]),
            };
            super::health::report(&handle, health);
        },
    )?;
    Ok(())
}

fn backup_health(
    s: &hm_core::Store,
    now: chrono::DateTime<chrono::Local>,
) -> hm_core::Result<BTreeMap<String, String>> {
    let settings = s.settings()?;
    let today = now.format("%Y-%m-%d").to_string();
    let mut health = BTreeMap::from([("maintenanceError".into(), String::new())]);
    if settings.get("last_backup_date") == Some(&today) {
        health.insert("backupError".into(), String::new());
        return Ok(health);
    }
    if let Some(directory) = settings.get("backup_directory") {
        match s.create_backup(std::path::Path::new(directory), true) {
            Ok(info) => {
                s.set_setting("last_backup_date", &today)?;
                health.insert("lastBackup".into(), info.created_at);
                health.insert("backupError".into(), String::new());
            }
            Err(error) => {
                health.insert("backupError".into(), error.to_string());
            }
        }
    }
    Ok(health)
}

#[cfg(mobile)]
pub(super) fn backup_once(app: &tauri::AppHandle) -> Result<BTreeMap<String, String>, String> {
    access(&app.state::<AppState>(), |s| {
        backup_health(s, chrono::Local::now())
    })
}
