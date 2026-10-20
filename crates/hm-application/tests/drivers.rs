use hm_application::{documents::import_documents, recording::RecordingService};
use hm_core::{CreateCase, MaterialTarget, Store};
use hm_runtime::platform::*;
use std::io::{Cursor, Read};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

struct MemoryDocument {
    name: String,
    bytes: Vec<u8>,
    drops: Arc<AtomicUsize>,
    fail: bool,
}
impl Drop for MemoryDocument {
    fn drop(&mut self) {
        self.drops.fetch_add(1, Ordering::SeqCst);
    }
}
struct BrokenReader(bool);
impl Read for BrokenReader {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        if self.0 {
            return Err(std::io::Error::other("provider disconnected"));
        }
        self.0 = true;
        let n = out.len().min(3);
        out[..n].copy_from_slice(&b"abc"[..n]);
        Ok(n)
    }
}
impl Document for MemoryDocument {
    fn name(&self) -> &str {
        &self.name
    }
    fn open(&mut self) -> DriverResult<Box<dyn Read + '_>> {
        if self.fail {
            Ok(Box::new(BrokenReader(false)))
        } else {
            Ok(Box::new(Cursor::new(&self.bytes)))
        }
    }
}
fn document(drops: Arc<AtomicUsize>, fail: bool) -> Box<dyn Document> {
    Box::new(MemoryDocument {
        name: "证据.txt".into(),
        bytes: b"provider bytes".to_vec(),
        drops,
        fail,
    })
}
fn workspace() -> (tempfile::TempDir, Store, MaterialTarget) {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("workspace.sqlite3")).unwrap();
    let case = store
        .create_case(CreateCase {
            id: "11111111-1111-4111-8111-111111111111".into(),
            title: "驱动测试（虚构）".into(),
            case_type: "other".into(),
            status_id: "in_progress".into(),
            tags: None,
        })
        .unwrap();
    let target = MaterialTarget {
        case_id: case.id,
        proceeding_id: None,
        stage_id: None,
        parent_id: None,
        record_id: None,
    };
    (dir, store, target)
}
#[test]
fn pathless_provider_archives_bytes_and_releases_grant() {
    let (_dir, store, target) = workspace();
    let drops = Arc::new(AtomicUsize::new(0));
    let report = import_documents(&store, &target, vec![document(drops.clone(), false)]).unwrap();
    assert_eq!(report.imported, 1);
    let item = store.materials().unwrap().remove(0);
    assert_eq!(item.name, "证据.txt");
    assert_eq!(
        std::fs::read(store.material_path(&item.id).unwrap()).unwrap(),
        b"provider bytes"
    );
    assert_eq!(drops.load(Ordering::SeqCst), 1);
}
#[test]
fn interrupted_provider_leaves_no_row_or_partial_object_and_other_files_continue() {
    let (dir, store, target) = workspace();
    let drops = Arc::new(AtomicUsize::new(0));
    let report = import_documents(
        &store,
        &target,
        vec![
            document(drops.clone(), true),
            document(drops.clone(), false),
        ],
    )
    .unwrap();
    assert_eq!(report.imported, 1);
    assert_eq!(report.errors.len(), 1);
    assert_eq!(store.materials().unwrap().len(), 1);
    assert_eq!(drops.load(Ordering::SeqCst), 2);
    fn files(path: &std::path::Path) -> usize {
        std::fs::read_dir(path)
            .map(|entries| {
                entries
                    .map(|entry| {
                        let path = entry.unwrap().path();
                        if path.is_dir() {
                            files(&path)
                        } else {
                            1
                        }
                    })
                    .sum()
            })
            .unwrap_or(0)
    }
    // Compare with the single material's object directory; no failed sibling survives.
    let archived = store
        .material_path(&store.materials().unwrap()[0].id)
        .unwrap();
    let objects = archived.parent().unwrap().parent().unwrap();
    assert_eq!(
        files(objects),
        1,
        "partial import under {}",
        dir.path().display()
    );
}

struct TestRecorder {
    drops: Arc<AtomicUsize>,
}
struct TestSession {
    state: RecordingState,
    drops: Arc<AtomicUsize>,
}
impl Drop for TestSession {
    fn drop(&mut self) {
        self.drops.fetch_add(1, Ordering::SeqCst);
    }
}
impl RecordingDriver for TestRecorder {
    fn support(&self) -> RecordingSupport {
        RecordingSupport {
            capture: true,
            pause: true,
        }
    }
    fn start(&self) -> DriverResult<Box<dyn RecordingSession>> {
        Ok(Box::new(TestSession {
            state: RecordingState::Recording,
            drops: self.drops.clone(),
        }))
    }
}
impl RecordingSession for TestSession {
    fn state(&self) -> RecordingState {
        self.state
    }
    fn pause(&mut self) -> DriverResult<()> {
        self.state = RecordingState::Paused;
        Ok(())
    }
    fn resume(&mut self) -> DriverResult<()> {
        self.state = RecordingState::Recording;
        Ok(())
    }
    fn finish(&mut self) -> DriverResult<Box<dyn Document>> {
        self.state = RecordingState::Finished;
        Ok(document(Arc::new(AtomicUsize::new(0)), false))
    }
    fn cancel(&mut self) -> DriverResult<()> {
        self.state = RecordingState::Finished;
        Ok(())
    }
}
#[test]
fn interchangeable_recording_driver_preserves_artifact_on_failed_archive() {
    let (_dir, store, target) = workspace();
    let drops = Arc::new(AtomicUsize::new(0));
    let mut service = RecordingService::new(Box::new(TestRecorder {
        drops: drops.clone(),
    }));
    service.start().unwrap();
    assert!(service.start().is_err());
    service.pause().unwrap();
    assert!(service.pause().is_err());
    service.resume().unwrap();
    service.finish().unwrap();
    assert_eq!(drops.load(Ordering::SeqCst), 1); // microphone released before archiving
    assert_eq!(service.state(), Some(RecordingState::Finished));
    assert!(service.archive(&store, &target, "../invalid").is_err());
    assert!(service.start().is_err());
    let id = service.archive(&store, &target, "录音.txt").unwrap();
    assert_eq!(
        std::fs::read(store.material_path(&id).unwrap()).unwrap(),
        b"provider bytes"
    );
    assert_eq!(service.state(), None);
    service.start().unwrap();
    service.cancel().unwrap();
    assert_eq!(drops.load(Ordering::SeqCst), 2);
}
#[test]
fn dropping_service_releases_active_microphone() {
    let drops = Arc::new(AtomicUsize::new(0));
    let mut service = RecordingService::new(Box::new(TestRecorder {
        drops: drops.clone(),
    }));
    service.start().unwrap();
    drop(service);
    assert_eq!(drops.load(Ordering::SeqCst), 1);
}
#[test]
fn unsupported_capture_returns_typed_error_without_a_session() {
    let mut service = RecordingService::new(Box::new(UnavailableRecording));
    assert_eq!(
        service.start().unwrap_err().kind,
        DriverErrorKind::Unsupported
    );
    assert_eq!(service.state(), None);
}
