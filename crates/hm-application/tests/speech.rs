use hm_application::speech::{audio_source, SpeechService};
use hm_core::*;
use hm_runtime::platform::*;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
use uuid::Uuid;

struct FakeDriver {
    snapshot: Arc<Mutex<SpeechSnapshot>>,
    starts: Arc<AtomicUsize>,
    drops: Arc<AtomicUsize>,
    on_device: bool,
}
struct FakeJob {
    snapshot: Arc<Mutex<SpeechSnapshot>>,
    drops: Arc<AtomicUsize>,
}
impl SpeechDriver for FakeDriver {
    fn support(&self, _: &str) -> DriverResult<SpeechSupport> {
        Ok(SpeechSupport {
            installed: true,
            on_device: self.on_device,
            available: true,
            authorization: "authorized".into(),
        })
    }
    fn start(
        &self,
        _: &str,
        audio: &mut dyn Document,
        _: &str,
    ) -> DriverResult<Box<dyn SpeechJob>> {
        let mut bytes = Vec::new();
        audio.open()?.read_to_end(&mut bytes)?;
        assert_eq!(bytes, b"fictional-audio");
        self.starts.fetch_add(1, Ordering::SeqCst);
        Ok(Box::new(FakeJob {
            snapshot: self.snapshot.clone(),
            drops: self.drops.clone(),
        }))
    }
}
impl SpeechJob for FakeJob {
    fn snapshot(&self) -> DriverResult<SpeechSnapshot> {
        Ok(self.snapshot.lock().unwrap().clone())
    }
    fn cancel(&mut self) -> DriverResult<SpeechSnapshot> {
        self.snapshot.lock().unwrap().phase = SpeechPhase::Canceled;
        self.snapshot()
    }
}
impl Drop for FakeJob {
    fn drop(&mut self) {
        self.drops.fetch_add(1, Ordering::SeqCst);
    }
}
fn store() -> (tempfile::TempDir, Store, String) {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(&dir.path().join("workspace.sqlite3")).unwrap();
    let c = s
        .create_case(CreateCase {
            id: Uuid::new_v4().to_string(),
            title: "Fictional speech job".into(),
            case_type: "civil".into(),
            status_id: "in_progress".into(),
            tags: None,
        })
        .unwrap();
    let id = s
        .save_recording(
            MaterialTarget {
                case_id: c.id,
                proceeding_id: None,
                parent_id: None,
                record_id: None,
                stage_id: None,
            },
            "source.m4a",
            b"fictional-audio",
        )
        .unwrap();
    (dir, s, id)
}
fn driver(on_device: bool) -> FakeDriver {
    FakeDriver {
        snapshot: Arc::new(Mutex::new(SpeechSnapshot {
            phase: SpeechPhase::Transcribing,
            total_seconds: 20.0,
            completed_seconds: 10.0,
            segments: vec![SpeechSegment {
                start_seconds: 0.0,
                end_seconds: 10.0,
                text: "Fictional recognized text".into(),
            }],
            partial: None,
            error: None,
        })),
        starts: Arc::new(AtomicUsize::new(0)),
        drops: Arc::new(AtomicUsize::new(0)),
        on_device,
    }
}
#[test]
fn one_job_per_workspace_retry_and_old_disposal_are_safe() {
    let (_root, s, audio) = store();
    let d = driver(true);
    let starts = d.starts.clone();
    let drops = d.drops.clone();
    let mut service = SpeechService::new(Box::new(d));
    let id = Uuid::new_v4().to_string();
    service
        .start(&id, audio_source(&s, &audio).unwrap(), "zh-CN")
        .unwrap();
    service
        .start(&id, audio_source(&s, &audio).unwrap(), "zh-CN")
        .unwrap();
    assert!(service
        .start(&id, audio_source(&s, &audio).unwrap(), "en-US")
        .is_err());
    let other = Uuid::new_v4().to_string();
    assert!(service
        .start(&other, audio_source(&s, &audio).unwrap(), "zh-CN")
        .is_err());
    assert_eq!(starts.load(Ordering::SeqCst), 1);
    service.cancel(&id).unwrap();
    assert_eq!(s.materials().unwrap().len(), 1); // Recognition never archives automatically.
    service.discard(&id).unwrap();
    assert_eq!(drops.load(Ordering::SeqCst), 1);
    service
        .start(&other, audio_source(&s, &audio).unwrap(), "zh-CN")
        .unwrap();
    service.discard(&id).unwrap();
    assert!(service.snapshot(&other).is_ok());
}
#[test]
fn interrupted_draft_can_be_edited_and_saved_once_and_archive_failure_keeps_it() {
    let (_root, mut s, audio) = store();
    let d = driver(true);
    let mut service = SpeechService::new(Box::new(d));
    let id = Uuid::new_v4().to_string();
    service
        .start(&id, audio_source(&s, &audio).unwrap(), "zh-CN")
        .unwrap();
    let document = Uuid::new_v4().to_string();
    assert!(service
        .archive(&s, &id, &document, "Draft.md", "Premature")
        .is_err());
    service.cancel(&id).unwrap();
    service
        .archive(
            &s,
            &id,
            &document,
            "Draft.md",
            "Human edited partial transcript",
        )
        .unwrap();
    service
        .archive(
            &s,
            &id,
            &document,
            "Draft.md",
            "Human edited partial transcript",
        )
        .unwrap();
    assert_eq!(s.materials().unwrap().len(), 2);
    assert_eq!(
        s.read_text_document(&document).unwrap(),
        "Human edited partial transcript"
    );
    s.trash_item("material", &audio).unwrap();
    assert!(service
        .archive(&s, &id, &Uuid::new_v4().to_string(), "Other.md", "Draft")
        .is_err());
    assert!(service.snapshot(&id).unwrap().has_text());
    assert_eq!(
        s.resource_relations()
            .unwrap()
            .iter()
            .filter(|r| r.kind == "transcript_of")
            .count(),
        1
    );
}
#[test]
fn unavailable_models_do_not_start_a_driver_and_silence_is_not_saved() {
    let (_root, s, audio) = store();
    let d = driver(false);
    let starts = d.starts.clone();
    let mut service = SpeechService::new(Box::new(d));
    assert_eq!(
        service
            .start(
                &Uuid::new_v4().to_string(),
                audio_source(&s, &audio).unwrap(),
                "zh-CN"
            )
            .unwrap_err()
            .code,
        "speech_on_device_unavailable"
    );
    assert_eq!(starts.load(Ordering::SeqCst), 0);
    let d = driver(true);
    let snapshot = d.snapshot.clone();
    let mut service = SpeechService::new(Box::new(d));
    let id = Uuid::new_v4().to_string();
    service
        .start(&id, audio_source(&s, &audio).unwrap(), "en-US")
        .unwrap();
    {
        let mut v = snapshot.lock().unwrap();
        v.phase = SpeechPhase::Completed;
        v.completed_seconds = 20.0;
        v.segments.clear();
    }
    assert!(service
        .archive(
            &s,
            &id,
            &Uuid::new_v4().to_string(),
            "Empty.md",
            "Invented text"
        )
        .is_err());
    assert_eq!(s.materials().unwrap().len(), 1);
}
