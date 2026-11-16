//! Backup transport contract: providers own authorization and transfer, never snapshot rules.
use super::{Document, DocumentDriver, DriverError, DriverResult};
use std::{io::Read, sync::Arc};

pub trait BackupDriver: Send + Sync {
    /// None is cancellation. The returned document owns its provider access grant.
    fn select(&self, title: &str) -> DriverResult<Option<Box<dyn Document>>>;
    /// Success means the provider accepted a complete file, not remote synchronization.
    fn export(&self, title: &str, name: &str, source: &mut dyn Read) -> DriverResult<Option<u64>>;
}

/// Files-based transport for iOS providers (including iCloud Drive) and desktop save dialogs.
pub struct FileBackupDriver(pub Arc<dyn DocumentDriver>);
impl BackupDriver for FileBackupDriver {
    fn select(&self, title: &str) -> DriverResult<Option<Box<dyn Document>>> {
        let Some(mut documents) = self.0.pick(title, false)? else {
            return Ok(None);
        };
        if documents.len() != 1 {
            return Err(DriverError::invalid_state("backup_selection_invalid"));
        }
        Ok(documents.pop())
    }
    fn export(&self, title: &str, name: &str, source: &mut dyn Read) -> DriverResult<Option<u64>> {
        self.0.export(title, name, source)
    }
}

pub struct UnavailableBackup;
impl BackupDriver for UnavailableBackup {
    fn select(&self, _: &str) -> DriverResult<Option<Box<dyn Document>>> {
        Err(DriverError::unsupported("backup_files"))
    }
    fn export(&self, _: &str, _: &str, _: &mut dyn Read) -> DriverResult<Option<u64>> {
        Err(DriverError::unsupported("backup_files"))
    }
}
