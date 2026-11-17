//! Audio transcription port. Drivers stage a borrowed source before returning;
//! they own recognition resources, while the application owns source retention,
//! job identity, case authorization and explicit archiving.
use super::{Document, DriverError, DriverResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechSupport {
    pub installed: bool,
    pub on_device: bool,
    pub available: bool,
    pub authorization: String,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SpeechPhase {
    Authorizing,
    Transcribing,
    Completed,
    Failed,
    Canceled,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechSegment {
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub text: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechSnapshot {
    pub phase: SpeechPhase,
    pub total_seconds: f64,
    pub completed_seconds: f64,
    pub segments: Vec<SpeechSegment>,
    pub partial: Option<SpeechSegment>,
    pub error: Option<String>,
}
impl SpeechSnapshot {
    pub fn has_text(&self) -> bool {
        self.segments
            .iter()
            .chain(self.partial.iter())
            .any(|s| !s.text.trim().is_empty())
    }
    pub fn validate(&self) -> DriverResult<()> {
        let segments = self.segments.iter().chain(self.partial.iter());
        if !self.total_seconds.is_finite()
            || !self.completed_seconds.is_finite()
            || self.completed_seconds < 0.0
            || self.completed_seconds > self.total_seconds
            || segments.clone().any(|s| {
                !s.start_seconds.is_finite()
                    || !s.end_seconds.is_finite()
                    || s.start_seconds < 0.0
                    || s.end_seconds < s.start_seconds
                    || s.end_seconds > self.total_seconds + 0.01
            })
            || segments.map(|s| s.text.len()).sum::<usize>() > 2 * 1024 * 1024
        {
            return Err(DriverError::invalid_state("speech_result_invalid"));
        }
        Ok(())
    }
}
pub trait SpeechJob: Send {
    fn snapshot(&self) -> DriverResult<SpeechSnapshot>;
    fn cancel(&mut self) -> DriverResult<SpeechSnapshot>;
    /// Explicit user disposal acknowledges native release before a replacement
    /// job starts. Drop remains a nonblocking fallback for host teardown.
    fn dispose(&mut self) -> DriverResult<()> {
        self.cancel().map(|_| ())
    }
    // Drop must release the recognition task and staged audio, without waiting on the UI thread.
}
pub trait SpeechDriver: Send + Sync {
    fn support(&self, language: &str) -> DriverResult<SpeechSupport>;
    fn start(
        &self,
        id: &str,
        audio: &mut dyn Document,
        language: &str,
    ) -> DriverResult<Box<dyn SpeechJob>>;
}
pub struct UnavailableSpeech;
impl SpeechDriver for UnavailableSpeech {
    fn support(&self, _: &str) -> DriverResult<SpeechSupport> {
        Ok(SpeechSupport {
            installed: false,
            on_device: false,
            available: false,
            authorization: "unavailable".into(),
        })
    }
    fn start(&self, _: &str, _: &mut dyn Document, _: &str) -> DriverResult<Box<dyn SpeechJob>> {
        Err(DriverError::unsupported("speech_transcription"))
    }
}
