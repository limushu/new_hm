pub mod documents;
#[cfg(windows)]
pub(crate) mod windows_icon;
use hm_runtime::platform::{
    DriverError, DriverResult, ExternalOpenDriver, HostDriver, LocalFilesystemDriver,
};
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

pub struct DesktopPlatform(pub tauri::AppHandle);
impl LocalFilesystemDriver for DesktopPlatform {
    fn pick_files(&self, title: &str, multiple: bool) -> DriverResult<Option<Vec<PathBuf>>> {
        let dialog = self.0.dialog().file().set_title(title);
        let files = if multiple {
            dialog.blocking_pick_files()
        } else {
            dialog.blocking_pick_file().map(|file| vec![file])
        };
        files
            .map(|files| {
                files
                    .into_iter()
                    .map(|file| file.into_path().map_err(DriverError::io))
                    .collect()
            })
            .transpose()
    }
    fn pick_folder(&self, title: &str) -> DriverResult<Option<PathBuf>> {
        self.0
            .dialog()
            .file()
            .set_title(title)
            .blocking_pick_folder()
            .map(|file| file.into_path().map_err(DriverError::io))
            .transpose()
    }
}
impl ExternalOpenDriver for DesktopPlatform {
    fn open_file(&self, path: &Path) -> DriverResult<()> {
        self.0
            .opener()
            .open_path(path.to_string_lossy().as_ref(), None::<&str>)
            .map_err(DriverError::io)
    }
}
impl HostDriver for DesktopPlatform {
    fn set_theme(&self, theme: Option<&str>) -> DriverResult<()> {
        let theme = theme.map(|value| {
            if value == "dark" {
                tauri::Theme::Dark
            } else {
                tauri::Theme::Light
            }
        });
        self.0
            .get_webview_window("main")
            .ok_or_else(|| DriverError::invalid_state("window_unavailable"))?
            .set_theme(theme)
            .map_err(DriverError::io)
    }
}
