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
