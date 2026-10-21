use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageLocation {
    pub portable: bool,
    pub data_directory: PathBuf,
}

impl StorageLocation {
    /// Mobile workspaces always use their private persistent application directory.
    /// No executable path or portable marker is consulted.
    pub fn sandbox(directory: &Path) -> Self {
        Self {
            portable: false,
            data_directory: directory.to_path_buf(),
        }
    }

    pub fn portable_directory(executable: &Path, supported: bool) -> Option<PathBuf> {
        if !supported {
            return None;
        }
        let directory = executable.parent()?;
        directory
            .join(".portable")
            .is_file()
            .then(|| directory.join("data"))
    }

    pub fn resolve(executable: &Path, installed_directory: &Path, supported: bool) -> Self {
        match Self::portable_directory(executable, supported) {
            Some(data_directory) => Self {
                portable: true,
                data_directory,
            },
            None => Self {
                portable: false,
                data_directory: installed_directory.to_path_buf(),
            },
        }
    }
}
