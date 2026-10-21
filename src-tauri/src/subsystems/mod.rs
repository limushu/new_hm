//! Composition root for host services. Business commands continue to use hm-core.
pub mod documents;
mod health;
#[cfg(desktop)]
pub mod host;
pub mod maintenance;
#[cfg(mobile)]
pub mod mobile;
pub mod recording;
#[cfg(desktop)]
pub mod updates;
use hm_runtime::RuntimeManifest;
#[cfg(desktop)]
use hm_runtime::WorkerScope;
use tauri::{Manager, State};

pub struct RuntimeState {
    manifest: RuntimeManifest,
    #[cfg(desktop)]
    workers: WorkerScope,
}

pub fn configure(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    #[cfg(target_os = "ios")]
    let builder = builder.plugin(tauri_plugin_hm_recording::init());
    #[cfg(desktop)]
    let builder = maintenance::configure(updates::configure(host::configure(builder)));
    builder
}

#[tauri::command]
pub fn subsystem_manifest(state: State<'_, RuntimeState>) -> RuntimeManifest {
    state.manifest.clone()
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(health::RuntimeHealth::default());
    crate::platforms::setup(app);
    #[cfg(desktop)]
    {
        host::setup(app)?;
        let workers = WorkerScope::default();
        updates::setup(app, &workers)?;
        maintenance::setup(app, &workers)?;
        app.manage(RuntimeState {
            manifest: app.state::<crate::platforms::NativeDrivers>().manifest(),
            workers,
        });
    }
    #[cfg(mobile)]
    {
        mobile::setup(app);
        app.manage(RuntimeState {
            manifest: app.state::<crate::platforms::NativeDrivers>().manifest(),
        });
    }
    Ok(())
}

pub fn shutdown(app: &tauri::AppHandle) {
    #[cfg(desktop)]
    if let Some(runtime) = app.try_state::<RuntimeState>() {
        runtime.workers.stop();
    }
    #[cfg(mobile)]
    let _ = app;
}
