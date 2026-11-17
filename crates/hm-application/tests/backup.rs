use hm_application::backup::BackupService;
use hm_core::{CreateCase, Store};
use hm_runtime::platform::{BackupDriver, Document, DriverResult};
use std::{
    io::{Cursor, Read},
    sync::{Arc, Mutex},
};

struct Transport {
    bytes: Arc<Mutex<Vec<u8>>>,
    cancelled: bool,
    short: bool,
}
struct MemoryDocument(Vec<u8>);
impl Document for MemoryDocument {
    fn name(&self) -> &str {
        "backup.zip"
    }
    fn open(&mut self) -> DriverResult<Box<dyn Read + '_>> {
        Ok(Box::new(Cursor::new(&self.0)))
    }
}
impl BackupDriver for Transport {
    fn select(&self, _: &str) -> DriverResult<Option<Box<dyn Document>>> {
        Ok((!self.cancelled).then(|| {
            Box::new(MemoryDocument(self.bytes.lock().unwrap().clone())) as Box<dyn Document>
        }))
    }
    fn export(&self, _: &str, _: &str, source: &mut dyn Read) -> DriverResult<Option<u64>> {
        if self.cancelled {
            return Ok(None);
        }
        let mut bytes = Vec::new();
        source.read_to_end(&mut bytes)?;
        let size = bytes.len() as u64;
        *self.bytes.lock().unwrap() = bytes;
        Ok(Some(if self.short { size - 1 } else { size }))
    }
}
#[test]
fn transport_can_be_replaced_without_snapshot_rules_and_restore_requires_valid_token_and_confirmation(
) {
    let directory = tempfile::tempdir().unwrap();
    let mut store = Store::open(&directory.path().join("workspace.sqlite3")).unwrap();
    store
        .create_case(CreateCase {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Transport fixture".into(),
            case_type: "civil".into(),
            status_id: "not_started".into(),
            tags: None,
        })
        .unwrap();
    let bytes = Arc::new(Mutex::new(Vec::new()));
    let mut service = BackupService::new(Box::new(Transport {
        bytes: bytes.clone(),
        cancelled: false,
        short: false,
    }));
    assert_eq!(
        service
            .export(BackupService::snapshot(&store).unwrap(), "export")
            .unwrap()
            .unwrap()
            .summary
            .case_count,
        1
    );
    let first = service.select("restore").unwrap().unwrap();
    assert!(service.restore(&mut store, "wrong", true).is_err());
    assert!(service.restore(&mut store, &first.token, false).is_err());
    let second = service.select("restore again").unwrap().unwrap();
    assert!(service.restore(&mut store, &first.token, true).is_err());
    service.discard(&first.token); // A delayed close cannot discard a newer selection.
    assert!(service.restore(&mut store, &second.token, true).is_ok());
    assert!(service.restore(&mut store, &second.token, true).is_err());
    let third = service.select("restore").unwrap().unwrap();
    service.discard(&third.token);
    assert!(service.restore(&mut store, &third.token, true).is_err());
    let cancelled = BackupService::new(Box::new(Transport {
        bytes: bytes.clone(),
        cancelled: true,
        short: false,
    }));
    assert!(cancelled
        .export(BackupService::snapshot(&store).unwrap(), "cancel")
        .unwrap()
        .is_none());
    let incomplete = BackupService::new(Box::new(Transport {
        bytes,
        cancelled: false,
        short: true,
    }));
    assert_eq!(
        incomplete
            .export(BackupService::snapshot(&store).unwrap(), "short write")
            .unwrap_err()
            .code,
        "backup_export_incomplete"
    );
}

#[test]
fn managed_backup_follows_relocated_workspace_preserves_history_and_only_marks_success() {
    use hm_application::backup::LocalBackupTarget;
    use hm_core::MaterialTarget;
    let root = tempfile::tempdir().unwrap();
    let original = root.path().join("old-container");
    std::fs::create_dir(&original).unwrap();
    let original = original.canonicalize().unwrap();
    let mut store = Store::open(&original.join("workspace.sqlite3")).unwrap();
    let case = store
        .create_case(CreateCase {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Relocated workspace fixture".into(),
            case_type: "other".into(),
            status_id: "in_progress".into(),
            tags: None,
        })
        .unwrap();
    store
        .import_reader(
            &MaterialTarget {
                case_id: case.id,
                proceeding_id: None,
                stage_id: None,
                parent_id: None,
                record_id: None,
            },
            "evidence.txt",
            &mut Cursor::new(b"preserved evidence"),
        )
        .unwrap();
    let day = chrono::NaiveDate::from_ymd_opt(2026, 11, 13).unwrap();
    let info = LocalBackupTarget::managed(original.clone())
        .run_now(&store, day)
        .unwrap();
    let historical = std::path::Path::new(&info.directory)
        .strip_prefix(&original)
        .unwrap()
        .to_path_buf();
    drop(store);
    let current = root.path().join("current-container");
    std::fs::rename(&original, &current).unwrap();
    let current = current.canonicalize().unwrap();
    // The old location cannot be used as a directory. A stale persisted path
    // would fail here, as inaccessible old sandbox paths do on a device.
    std::fs::write(&original, b"old location is unavailable").unwrap();
    let store = Store::open(&current.join("workspace.sqlite3")).unwrap();
    assert!(store
        .setting("backup_directory")
        .unwrap()
        .unwrap()
        .starts_with(original.to_str().unwrap()));
    let target = LocalBackupTarget::managed(current.clone());
    let today = chrono::NaiveDate::from_ymd_opt(2026, 11, 17).unwrap();
    let backup = target.run_daily(&store, today).unwrap().unwrap();
    assert_eq!(
        std::path::Path::new(&backup.directory).parent().unwrap(),
        current.join("backups")
    );
    assert_eq!(
        store.setting("backup_directory").unwrap().unwrap(),
        current.join("backups").to_string_lossy()
    );
    assert_eq!(
        store.setting("last_backup_date").unwrap().as_deref(),
        Some("2026-11-17")
    );
    assert_eq!(
        Store::inspect_backup(&current.join(historical))
            .unwrap()
            .file_count,
        1
    );
    let inspected = Store::inspect_backup(std::path::Path::new(&backup.directory)).unwrap();
    assert_eq!((inspected.case_count, inspected.file_count), (1, 1));
    assert!(target.run_daily(&store, today).unwrap().is_none());
    assert_eq!(
        std::fs::read(&original).unwrap(),
        b"old location is unavailable"
    );
}

#[test]
fn configurable_backup_keeps_selected_folder_and_never_falls_back_or_marks_failed_write() {
    use hm_application::backup::LocalBackupTarget;
    let root = tempfile::tempdir().unwrap();
    let app = root.path().join("workspace");
    std::fs::create_dir(&app).unwrap();
    let store = Store::open(&app.join("workspace.sqlite3")).unwrap();
    let external = root.path().join("selected-folder");
    store
        .set_setting("backup_directory", external.to_str().unwrap())
        .unwrap();
    let target = LocalBackupTarget::configurable(app.clone());
    let day = chrono::NaiveDate::from_ymd_opt(2026, 11, 13).unwrap();
    let backup = target.run_now(&store, day).unwrap();
    assert_eq!(
        std::path::Path::new(&backup.directory).parent().unwrap(),
        external.canonicalize().unwrap()
    );
    let blocked = root.path().join("blocked");
    std::fs::write(&blocked, b"unavailable volume").unwrap();
    let missing = blocked.join("backups");
    store
        .set_setting("backup_directory", missing.to_str().unwrap())
        .unwrap();
    let today = chrono::NaiveDate::from_ymd_opt(2026, 11, 17).unwrap();
    assert!(target.run_daily(&store, today).is_err());
    assert_eq!(
        store.setting("last_backup_date").unwrap().as_deref(),
        Some("2026-11-13")
    );
    assert_eq!(
        store.setting("backup_directory").unwrap().unwrap(),
        missing.to_string_lossy()
    );
    assert!(!app.join("backups").exists());
}
