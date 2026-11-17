use crate::platforms::NativeDrivers;
use hm_runtime::platform::DriverError;
use tauri::State;

// Native iOS appearance completes on UIKit's main queue. Keep the bridge wait
// off that queue, as with recording and speech commands.
#[tauri::command(async)]
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
