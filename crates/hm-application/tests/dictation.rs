use hm_application::{
    dictation::DictationService, recording::RecordingService, speech::SpeechService,
};
use hm_core::Store;
use hm_runtime::platform::*;
use std::{
    io::{Cursor, Read},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
};
use uuid::Uuid;

#[derive(Default)]
struct Effects {
    microphone: AtomicUsize,
    microphone_drops: AtomicUsize,
    audio_drops: AtomicUsize,
    recognitions: AtomicUsize,
    deny_microphone: AtomicBool,
    deny_speech: AtomicBool,
    no_model: AtomicBool,
    fail_stage: AtomicBool,
    fail_status: AtomicBool,
    fail_cancel: AtomicBool,
    job_drops: AtomicUsize,
}
struct Capture(Arc<Effects>);
struct Session(Arc<Effects>);
struct Audio(Arc<Effects>);
impl Document for Audio {
    fn name(&self) -> &str {
        "voice.m4a"
    }
    fn open(&mut self) -> DriverResult<Box<dyn Read + '_>> {
        Ok(Box::new(Cursor::new(b"fictional-audio")))
    }
}
impl Drop for Audio {
    fn drop(&mut self) {
        self.0.audio_drops.fetch_add(1, Ordering::SeqCst);
    }
}
impl RecordingDriver for Capture {
    fn support(&self) -> RecordingSupport {
        RecordingSupport {
            capture: true,
            pause: true,
        }
    }
    fn start(&self) -> DriverResult<Box<dyn RecordingSession>> {
        if self.0.deny_microphone.load(Ordering::SeqCst) {
            return Err(DriverError::invalid_state("microphone_permission_denied"));
        }
        self.0.microphone.fetch_add(1, Ordering::SeqCst);
        Ok(Box::new(Session(self.0.clone())))
    }
}
impl RecordingSession for Session {
    fn state(&self) -> RecordingState {
        RecordingState::Recording
    }
    fn pause(&mut self) -> DriverResult<()> {
        Ok(())
    }
    fn resume(&mut self) -> DriverResult<()> {
        Ok(())
    }
    fn finish(&mut self) -> DriverResult<Box<dyn Document>> {
        Ok(Box::new(Audio(self.0.clone())))
    }
    fn cancel(&mut self) -> DriverResult<()> {
        if self.0.fail_cancel.swap(false, Ordering::SeqCst) {
            return Err(DriverError::invalid_state("recording_failed"));
        }
        Ok(())
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        self.0.microphone_drops.fetch_add(1, Ordering::SeqCst);
    }
}
struct Recognition(Arc<Effects>);
struct Job(Arc<Effects>);
fn result(phase: SpeechPhase) -> SpeechSnapshot {
    SpeechSnapshot {
        phase,
        total_seconds: 12.0,
        completed_seconds: 12.0,
        segments: vec![SpeechSegment {
            start_seconds: 0.0,
            end_seconds: 12.0,
            text: "虚构沟通纪要。".into(),
        }],
        partial: None,
        error: None,
    }
}
impl SpeechDriver for Recognition {
    fn support(&self, _: &str) -> DriverResult<SpeechSupport> {
        Ok(SpeechSupport {
            installed: true,
            on_device: !self.0.no_model.load(Ordering::SeqCst),
            available: true,
            authorization: if self.0.deny_speech.load(Ordering::SeqCst) {
                "denied"
            } else {
                "authorized"
            }
            .into(),
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
        self.0.recognitions.fetch_add(1, Ordering::SeqCst);
        if self.0.fail_stage.swap(false, Ordering::SeqCst) {
            return Err(DriverError::invalid_state("speech_bridge_failed"));
        }
        Ok(Box::new(Job(self.0.clone())))
    }
}
impl SpeechJob for Job {
    fn snapshot(&self) -> DriverResult<SpeechSnapshot> {
        if self.0.fail_status.swap(false, Ordering::SeqCst) {
            return Err(DriverError::invalid_state("speech_bridge_failed"));
        }
        Ok(result(SpeechPhase::Completed))
    }
    fn cancel(&mut self) -> DriverResult<SpeechSnapshot> {
        Ok(result(SpeechPhase::Canceled))
    }
}
impl Drop for Job {
    fn drop(&mut self) {
        self.0.job_drops.fetch_add(1, Ordering::SeqCst);
    }
}
fn services(effects: &Arc<Effects>) -> (DictationService, RecordingService, SpeechService) {
    (
        DictationService::default(),
        RecordingService::new(Box::new(Capture(effects.clone()))),
        SpeechService::new(Box::new(Recognition(effects.clone()))),
    )
}

#[test]
fn temporary_input_reuses_services_and_cannot_archive_an_unrelated_business_material() {
    let effects = Arc::new(Effects::default());
    let (mut d, mut r, mut s) = services(&effects);
    let id = Uuid::new_v4().to_string();
    d.start(&mut r, &mut s, &id, "zh-CN").unwrap();
    assert!(s.has_pending()); // Reserved before recognition, also blocks incoming database replacement.
    assert!(r.cancel().is_err());
    assert!(r.finish().is_err());
    assert!(r.pause().is_err());
    let snapshot = d.finish(&mut r, &mut s, &id).unwrap();
    assert_eq!(snapshot.speech.unwrap().phase, SpeechPhase::Completed);
    assert!(r.state().is_none());
    assert_eq!(effects.microphone_drops.load(Ordering::SeqCst), 1);
    assert_eq!(effects.audio_drops.load(Ordering::SeqCst), 1);
    d.finish(&mut r, &mut s, &id).unwrap();
    assert_eq!(effects.recognitions.load(Ordering::SeqCst), 1);
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(&root.path().join("db.sqlite")).unwrap();
    assert_eq!(
        s.archive(
            &store,
            &id,
            &Uuid::new_v4().to_string(),
            "unexpected.md",
            "text"
        )
        .unwrap_err()
        .code,
        "speech_source_not_archivable"
    );
    assert!(store.materials().unwrap().is_empty());
    d.discard(&mut r, &mut s, &id).unwrap();
    assert!(!s.has_pending());
    assert_eq!(effects.job_drops.load(Ordering::SeqCst), 1);
}
#[test]
fn staging_failure_keeps_finished_audio_for_retry_and_does_not_reopen_the_microphone() {
    let effects = Arc::new(Effects::default());
    effects.fail_stage.store(true, Ordering::SeqCst);
    let (mut d, mut r, mut s) = services(&effects);
    let id = Uuid::new_v4().to_string();
    d.start(&mut r, &mut s, &id, "zh-CN").unwrap();
    assert!(d.finish(&mut r, &mut s, &id).is_err());
    assert_eq!(
        d.snapshot(&r, &s, &id).unwrap().capture,
        Some(RecordingState::Finished)
    );
    assert_eq!(effects.audio_drops.load(Ordering::SeqCst), 0);
    assert!(r.cancel().is_err());
    d.finish(&mut r, &mut s, &id).unwrap();
    assert_eq!(effects.microphone.load(Ordering::SeqCst), 1);
    assert_eq!(effects.recognitions.load(Ordering::SeqCst), 2);
    assert_eq!(effects.audio_drops.load(Ordering::SeqCst), 1);
    d.discard(&mut r, &mut s, &id).unwrap();
}
#[test]
fn a_failed_first_status_does_not_restart_recognition_or_cancel_a_later_capture() {
    let effects = Arc::new(Effects::default());
    effects.fail_status.store(true, Ordering::SeqCst);
    let (mut d, mut r, mut s) = services(&effects);
    let id = Uuid::new_v4().to_string();
    d.start(&mut r, &mut s, &id, "zh-CN").unwrap();
    assert!(d.finish(&mut r, &mut s, &id).is_err());
    assert!(d
        .finish(&mut r, &mut s, &id)
        .unwrap()
        .speech
        .unwrap()
        .has_text());
    assert_eq!(effects.recognitions.load(Ordering::SeqCst), 1);
    r.start().unwrap();
    d.discard(&mut r, &mut s, &id).unwrap();
    assert_eq!(r.state(), Some(RecordingState::Recording));
    r.cancel().unwrap();
}
#[test]
fn refusal_and_unavailable_models_leave_no_pending_capture_or_speech_reservation() {
    for kind in ["model", "speech", "microphone"] {
        let effects = Arc::new(Effects::default());
        effects.no_model.store(kind == "model", Ordering::SeqCst);
        effects
            .deny_speech
            .store(kind == "speech", Ordering::SeqCst);
        effects
            .deny_microphone
            .store(kind == "microphone", Ordering::SeqCst);
        let (mut d, mut r, mut s) = services(&effects);
        let id = Uuid::new_v4().to_string();
        assert!(d.start(&mut r, &mut s, &id, "zh-CN").is_err());
        assert!(r.state().is_none());
        assert!(!s.has_pending());
        assert_eq!(effects.microphone.load(Ordering::SeqCst), 0);
        d.discard(&mut r, &mut s, &id).unwrap();
    }
}
#[test]
fn cleanup_can_retry_and_an_old_editor_cannot_discard_a_new_input() {
    let effects = Arc::new(Effects::default());
    effects.fail_cancel.store(true, Ordering::SeqCst);
    let (mut d, mut r, mut s) = services(&effects);
    let old = Uuid::new_v4().to_string();
    let next = Uuid::new_v4().to_string();
    d.start(&mut r, &mut s, &old, "zh-CN").unwrap();
    assert!(d.discard(&mut r, &mut s, &old).is_err());
    assert!(s.has_pending());
    assert!(d.start(&mut r, &mut s, &next, "zh-CN").is_err());
    d.discard(&mut r, &mut s, &old).unwrap();
    d.start(&mut r, &mut s, &next, "zh-CN").unwrap();
    d.discard(&mut r, &mut s, &old).unwrap();
    assert_eq!(
        d.snapshot(&r, &s, &next).unwrap().capture,
        Some(RecordingState::Recording)
    );
    d.discard(&mut r, &mut s, &next).unwrap();
    assert!(!s.has_pending());
}

#[test]
fn material_transcription_and_voice_input_share_one_recognition_slot() {
    use hm_application::speech::audio_source;
    use hm_core::{CreateCase, MaterialTarget};
    let effects = Arc::new(Effects::default());
    let (mut d, mut r, mut s) = services(&effects);
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(&root.path().join("db.sqlite")).unwrap();
    let case = store
        .create_case(CreateCase {
            id: Uuid::new_v4().to_string(),
            title: "虚构案例".into(),
            case_type: "civil".into(),
            status_id: "in_progress".into(),
            tags: None,
        })
        .unwrap();
    let audio = store
        .save_recording(
            MaterialTarget {
                case_id: case.id,
                proceeding_id: None,
                parent_id: None,
                record_id: None,
                stage_id: None,
            },
            "original.m4a",
            b"fictional-audio",
        )
        .unwrap();
    let material_job = Uuid::new_v4().to_string();
    let input = Uuid::new_v4().to_string();
    s.start(
        &material_job,
        audio_source(&store, &audio).unwrap(),
        "zh-CN",
    )
    .unwrap();
    assert_eq!(
        d.start(&mut r, &mut s, &input, "zh-CN").unwrap_err().code,
        "speech_busy"
    );
    assert_eq!(effects.microphone.load(Ordering::SeqCst), 0);
    s.discard(&material_job).unwrap();
    d.start(&mut r, &mut s, &input, "zh-CN").unwrap();
    assert_eq!(
        s.start(
            &material_job,
            audio_source(&store, &audio).unwrap(),
            "zh-CN"
        )
        .unwrap_err()
        .code,
        "speech_busy"
    );
    d.discard(&mut r, &mut s, &input).unwrap();
    s.start(
        &material_job,
        audio_source(&store, &audio).unwrap(),
        "zh-CN",
    )
    .unwrap();
    s.discard(&material_job).unwrap();
    assert_eq!(store.materials().unwrap().len(), 1);
}
