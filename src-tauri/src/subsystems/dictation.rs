//! Host composition only. Lock order matches backup/sync: capture, then speech.
use super::{recording::RecordingState, speech::SpeechState};
use hm_application::{
    dictation::{DictationService, DictationSnapshot},
    recording::RecordingService,
    speech::SpeechService,
};
use hm_runtime::platform::{DriverError, DriverResult};
use std::sync::Mutex;
use tauri::State;

#[derive(Default)]
pub struct DictationState(pub Mutex<DictationService>);
fn run<T>(
    dictation: &DictationState,
    recording: &RecordingState,
    speech: &SpeechState,
    action: impl FnOnce(
        &mut DictationService,
        &mut RecordingService,
        &mut SpeechService,
    ) -> DriverResult<T>,
) -> DriverResult<T> {
    let unavailable = |_| DriverError::invalid_state("dictation_unavailable");
    let mut d = dictation.0.lock().map_err(unavailable)?;
    let mut r = recording
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("recording_unavailable"))?;
    let mut s = speech
        .0
        .lock()
        .map_err(|_| DriverError::invalid_state("speech_unavailable"))?;
    action(&mut d, &mut r, &mut s)
}
#[tauri::command(async)]
pub fn start_dictation(
    dictation: State<'_, DictationState>,
    recording: State<'_, RecordingState>,
    speech: State<'_, SpeechState>,
    id: String,
    language: String,
) -> DriverResult<DictationSnapshot> {
    run(&dictation, &recording, &speech, |d, r, s| {
        d.start(r, s, &id, &language)
    })
}
#[tauri::command(async)]
pub fn finish_dictation(
    dictation: State<'_, DictationState>,
    recording: State<'_, RecordingState>,
    speech: State<'_, SpeechState>,
    id: String,
) -> DriverResult<DictationSnapshot> {
    run(&dictation, &recording, &speech, |d, r, s| {
        d.finish(r, s, &id)
    })
}
#[tauri::command(async)]
pub fn dictation_state(
    dictation: State<'_, DictationState>,
    recording: State<'_, RecordingState>,
    speech: State<'_, SpeechState>,
    id: String,
) -> DriverResult<DictationSnapshot> {
    run(&dictation, &recording, &speech, |d, r, s| {
        d.snapshot(r, s, &id)
    })
}
#[tauri::command(async)]
pub fn stop_dictation_transcription(
    dictation: State<'_, DictationState>,
    recording: State<'_, RecordingState>,
    speech: State<'_, SpeechState>,
    id: String,
) -> DriverResult<DictationSnapshot> {
    run(&dictation, &recording, &speech, |d, _, s| d.stop(s, &id))
}
#[tauri::command(async)]
pub fn discard_dictation(
    dictation: State<'_, DictationState>,
    recording: State<'_, RecordingState>,
    speech: State<'_, SpeechState>,
    id: String,
) -> DriverResult<()> {
    run(&dictation, &recording, &speech, |d, r, s| {
        d.discard(r, s, &id)
    })
}
