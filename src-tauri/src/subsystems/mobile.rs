//! Minimal mobile host: private storage, no desktop shell or long-lived polling.
use hm_runtime::ActivityGate;
use tauri::Manager;

#[derive(Default)]
pub struct MobileState {
    maintenance: ActivityGate,
}

pub(super) fn setup(app: &mut tauri::App) {
    app.manage(MobileState::default());
}

#[tauri::command]
pub fn resume_runtime(app: tauri::AppHandle) {
    resume(&app);
}

pub fn resume(app: &tauri::AppHandle) {
    let Some(permit) = app.state::<MobileState>().maintenance.try_enter() else {
        return;
    };
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        // An opportunity to back up, not a guarantee of OS background execution.
        let health = match super::maintenance::backup_once(&handle) {
            Ok(health) => health,
            Err(error) => std::collections::BTreeMap::from([("maintenanceError".into(), error)]),
        };
        super::health::report(&handle, health);
    });
}
