//! Temporary voice input composes capture and recognition without saving materials.
use crate::{recording::RecordingService, speech::SpeechService};
use hm_runtime::platform::{DriverError, DriverResult, RecordingState, SpeechSnapshot};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationSnapshot {
    pub capture: Option<RecordingState>,
    pub speech: Option<SpeechSnapshot>,
}
struct Input {
    id: String,
    language: String,
    recognizing: bool,
}
#[derive(Default)]
pub struct DictationService {
    active: Option<Input>,
}
impl DictationService {
    fn input(&self, id: &str) -> DriverResult<&Input> {
        self.active
            .as_ref()
            .filter(|input| input.id == id)
            .ok_or_else(|| DriverError::invalid_state("dictation_missing"))
    }
    pub fn start(
        &mut self,
        recording: &mut RecordingService,
        speech: &mut SpeechService,
        id: &str,
        language: &str,
    ) -> DriverResult<DictationSnapshot> {
        if let Some(active) = &self.active {
            if active.id == id && active.language == language {
                return self.snapshot(recording, speech, id);
            }
            return Err(DriverError::invalid_state("dictation_busy"));
        }
        speech.prepare_input(id, language)?;
        recording.start_input(id)?;
        speech.reserve_input(id, language);
        self.active = Some(Input {
            id: id.to_owned(),
            language: language.to_owned(),
            recognizing: false,
        });
        self.snapshot(recording, speech, id)
    }
    pub fn snapshot(
        &self,
        recording: &RecordingService,
        speech: &SpeechService,
        id: &str,
    ) -> DriverResult<DictationSnapshot> {
        let input = self.input(id)?;
        if input.recognizing {
            Ok(DictationSnapshot {
                capture: None,
                speech: Some(speech.snapshot(id)?),
            })
        } else {
            Ok(DictationSnapshot {
                capture: Some(recording.input_state(id)?),
                speech: None,
            })
        }
    }
    pub fn finish(
        &mut self,
        recording: &mut RecordingService,
        speech: &mut SpeechService,
        id: &str,
    ) -> DriverResult<DictationSnapshot> {
        let input = self.input(id)?;
        if !input.recognizing {
            let result =
                recording.consume_input(id, |audio| speech.start_input(id, audio, &input.language));
            // A created job may have failed its initial status query. It must
            // remain available for polling or explicit disposal, not be restarted.
            if result.is_ok() || speech.is_input(id) {
                self.active.as_mut().unwrap().recognizing = true;
                recording.cancel_input(id)?;
            }
            result?;
        }
        self.snapshot(recording, speech, id)
    }
    pub fn stop(&self, speech: &mut SpeechService, id: &str) -> DriverResult<DictationSnapshot> {
        if !self.input(id)?.recognizing {
            return Err(DriverError::invalid_state("speech_not_finished"));
        }
        Ok(DictationSnapshot {
            capture: None,
            speech: Some(speech.cancel(id)?),
        })
    }
    /// Late cleanup from an old editor cannot stop a newer recording or job.
    pub fn discard(
        &mut self,
        recording: &mut RecordingService,
        speech: &mut SpeechService,
        id: &str,
    ) -> DriverResult<()> {
        let Some(input) = self.active.as_ref().filter(|input| input.id == id) else {
            return Ok(());
        };
        if !input.recognizing {
            recording.cancel_input(id)?
        }
        speech.discard(id)?;
        self.active = None;
        Ok(())
    }
}
