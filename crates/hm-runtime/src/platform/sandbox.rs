use super::{DriverError, DriverResult, ExternalOpenDriver, HostDriver, LocalFilesystemDriver};
use std::path::{Path, PathBuf};

pub struct SandboxPlatform;
impl LocalFilesystemDriver for SandboxPlatform {
    fn pick_files(&self, _: &str, _: bool) -> DriverResult<Option<Vec<PathBuf>>> {
        Err(DriverError::unsupported("local_file_pick"))
    }
    fn pick_folder(&self, _: &str) -> DriverResult<Option<PathBuf>> {
        Err(DriverError::unsupported("local_directory_pick"))
    }
}
impl ExternalOpenDriver for SandboxPlatform {
    fn open_file(&self, _: &Path) -> DriverResult<()> {
        Err(DriverError::unsupported("external_open"))
    }
}
impl HostDriver for SandboxPlatform {
    fn set_theme(&self, _: Option<&str>) -> DriverResult<()> {
        Err(DriverError::unsupported("window_theme"))
    }
}
