//! Snapshot/restore orchestration is shared by every transport. The host serializes calls.
use crate::errors::core_error;
use hm_core::{BackupArchive, BackupInfo, PreparedBackup, Store};
use hm_runtime::platform::{BackupDriver, DriverError, DriverResult};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub created_at: String,
    pub case_count: usize,
    pub file_count: usize,
}
impl From<&BackupInfo> for BackupSummary {
    fn from(info: &BackupInfo) -> Self {
        Self {
            created_at: info.created_at.clone(),
            case_count: info.case_count,
            file_count: info.file_count,
        }
    }
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExport {
    pub name: String,
    pub summary: BackupSummary,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupCandidate {
    pub token: String,
    pub summary: BackupSummary,
}
pub struct BackupService {
    driver: Box<dyn BackupDriver>,
    pending: Option<(String, PreparedBackup)>,
}
impl BackupService {
    pub fn create_local(
        store: &Store,
        directory: &std::path::Path,
        retain: bool,
    ) -> DriverResult<BackupInfo> {
        store.create_backup(directory, retain).map_err(core_error)
    }
    pub fn new(driver: Box<dyn BackupDriver>) -> Self {
        Self {
            driver,
            pending: None,
        }
    }
    pub fn snapshot(store: &Store) -> DriverResult<BackupArchive> {
        store.create_backup_archive().map_err(core_error)
    }
    /// The host releases its workspace lock before presenting any provider UI.
    pub fn export(
        &self,
        archive: BackupArchive,
        title: &str,
    ) -> DriverResult<Option<BackupExport>> {
        let mut file = archive.open().map_err(core_error)?;
        let expected = file.metadata()?.len();
        match self.driver.export(title, &archive.name, &mut file)? {
            None => Ok(None),
            Some(bytes) if bytes == expected => Ok(Some(BackupExport {
                name: archive.name.clone(),
                summary: (&archive.info).into(),
            })),
            Some(_) => Err(DriverError::invalid_state("backup_export_incomplete")),
        }
    }
    pub fn select(&mut self, title: &str) -> DriverResult<Option<BackupCandidate>> {
        self.pending = None;
        let Some(mut document) = self.driver.select(title)? else {
            return Ok(None);
        };
        let backup = PreparedBackup::read(&mut document.open()?).map_err(core_error)?;
        let token = uuid::Uuid::new_v4().to_string();
        let candidate = BackupCandidate {
            token: token.clone(),
            summary: (&backup.info).into(),
        };
        self.pending = Some((token, backup));
        Ok(Some(candidate))
    }
    pub fn discard(&mut self, token: &str) {
        if self.pending.as_ref().is_some_and(|(id, _)| id == token) {
            self.pending = None;
        }
    }
    pub fn restore(
        &mut self,
        store: &mut Store,
        token: &str,
        confirmed: bool,
    ) -> DriverResult<BackupSummary> {
        let (_, backup) = self
            .pending
            .as_ref()
            .filter(|(id, _)| id == token)
            .ok_or_else(|| DriverError::invalid_state("backup_candidate_expired"))?;
        backup.restore(store, confirmed).map_err(core_error)?;
        let summary = (&backup.info).into();
        self.pending = None;
        Ok(summary)
    }
}
