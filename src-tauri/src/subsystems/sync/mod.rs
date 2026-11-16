use crate::platforms::NativeDrivers;
use tauri::State;

/// Installation metadata only; does not claim container, identity or cloud readiness.
#[tauri::command]
pub fn native_sync_provider(platform: State<'_, NativeDrivers>) -> Option<String> {
    platform.sync.provider().map(str::to_owned)
}
