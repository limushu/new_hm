use crate::{access, AppState};
use std::collections::BTreeMap;
use tauri::{Manager, State};

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
            super::agenda::changed(&handle);
            let target = handle.state::<hm_application::backup::LocalBackupTarget>();
            let result = access(&handle.state::<AppState>(), |s| {
                let now = chrono::Local::now();
                let health = backup_health(s, now, &target);
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
    target: &hm_application::backup::LocalBackupTarget,
) -> BTreeMap<String, String> {
    let mut health = BTreeMap::from([("maintenanceError".into(), String::new())]);
    match target.run_daily(s, now.date_naive()) {
        Ok(Some(info)) => {
            health.insert("lastBackup".into(), info.created_at);
            health.insert("lastBackupDate".into(), now.date_naive().to_string());
            health.insert("backupError".into(), String::new());
        }
        Ok(None) => {
            health.insert("lastBackupDate".into(), now.date_naive().to_string());
            health.insert("backupError".into(), String::new());
        }
        Err(error) => {
            health.insert("backupError".into(), error.detail.unwrap_or(error.code));
        }
    }
    health
}

#[cfg(mobile)]
pub(super) fn backup_once(app: &tauri::AppHandle) -> Result<BTreeMap<String, String>, String> {
    let target = app.state::<hm_application::backup::LocalBackupTarget>();
    access(&app.state::<AppState>(), |s| {
        Ok(backup_health(s, chrono::Local::now(), &target))
    })
}
