//! Small capability-specific ports. Directory access is deliberately separate
//! from external documents: mobile providers need not expose local paths.
use std::path::{Path, PathBuf};

pub trait HostDriver: Send + Sync {
    fn set_theme(&self, theme: Option<&str>) -> Result<(), String>;
}
pub trait ExternalOpenDriver: Send + Sync {
    fn open_file(&self, path: &Path) -> Result<(), String>;
}
/// Legacy directory workflows (backup and receipt attachment).
/// This contract explicitly requires a local filesystem; document providers do not.
pub trait LocalFilesystemDriver: Send + Sync {
    fn pick_files(&self, title: &str, multiple: bool) -> Result<Option<Vec<PathBuf>>, String>;
    fn pick_folder(&self, title: &str) -> Result<Option<PathBuf>, String>;
}
