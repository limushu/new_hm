use crate::platforms::NativeDrivers;
use hm_runtime::platform::DriverError;
use tauri::State;

#[tauri::command]
pub fn set_window_theme(
    platform: State<'_, NativeDrivers>,
    theme: String,
) -> Result<(), DriverError> {
    let theme = match theme.as_str() {
        "system" => None,
        "dark" => Some("dark"),
        "light" => Some("light"),
        _ => return Err(DriverError::invalid_state("theme_invalid")),
    };
    platform.host.set_theme(theme)
}
