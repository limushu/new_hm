//! Shared diagnostics channel; subsystems never access one another's mutable state.
use std::{collections::BTreeMap, sync::Mutex};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct RuntimeHealth(Mutex<BTreeMap<String, String>>);

impl RuntimeHealth {
    pub fn snapshot(&self) -> Result<BTreeMap<String, String>, String> {
        self.0
            .lock()
            .map(|health| health.clone())
            .map_err(|_| "后台状态不可用".into())
    }
}

pub(super) fn report(app: &tauri::AppHandle, changes: BTreeMap<String, String>) {
    let health = app.state::<RuntimeHealth>();
    // Release the diagnostics lock before emitting into another subsystem.
    let snapshot = health.0.lock().ok().map(|mut health| {
        health.extend(changes);
        health.clone()
    });
    if let Some(snapshot) = snapshot {
        let _ = app.emit("background-status", snapshot);
    }
}
