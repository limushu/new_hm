use super::{ExternalOpenDriver, HostDriver, LocalFilesystemDriver};
use std::path::{Path, PathBuf};

pub struct SandboxPlatform;
impl LocalFilesystemDriver for SandboxPlatform {
    fn pick_files(&self, _: &str, _: bool) -> Result<Option<Vec<PathBuf>>, String> {
        Err("当前驱动不支持本地文件选择".into())
    }
    fn pick_folder(&self, _: &str) -> Result<Option<PathBuf>, String> {
        Err("当前驱动不支持本地目录选择".into())
    }
}
impl ExternalOpenDriver for SandboxPlatform {
    fn open_file(&self, _: &Path) -> Result<(), String> {
        Err("当前驱动不支持系统打开".into())
    }
}
impl HostDriver for SandboxPlatform {
    fn set_theme(&self, _: Option<&str>) -> Result<(), String> {
        Err("当前驱动不支持窗口主题".into())
    }
}
