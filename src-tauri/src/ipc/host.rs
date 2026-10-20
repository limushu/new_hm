use crate::platforms::NativeDrivers;
use tauri::State;

#[tauri::command]
pub fn set_window_theme(platform: State<'_, NativeDrivers>, theme: String) -> Result<(), String> {
    let theme = match theme.as_str() {
        "system" => None,
        "dark" => Some("dark"),
        "light" => Some("light"),
        _ => return Err("无效的主题".into()),
    };
    platform.host.set_theme(theme)
}
