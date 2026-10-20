//! Native capture contract. Captured audio is a resource consumed by archiving,
//! not a platform path or an assumed WebM blob.
use super::{Document, DriverError, DriverResult};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RecordingState {
    Recording,
    Paused,
    Interrupted,
    Finished,
}
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSupport {
    pub capture: bool,
    pub pause: bool,
}
pub trait RecordingSession: Send {
    fn state(&self) -> RecordingState;
    fn pause(&mut self) -> DriverResult<()>;
    fn resume(&mut self) -> DriverResult<()>;
    /// A failed finish must leave the session available for retry or cancel.
    fn finish(&mut self) -> DriverResult<Box<dyn Document>>;
    fn cancel(&mut self) -> DriverResult<()>;
    // Implementations must release microphone resources on Drop.
}
pub trait RecordingDriver: Send + Sync {
    fn support(&self) -> RecordingSupport;
    /// Includes native authorization; permission denial is a typed error.
    fn start(&self) -> DriverResult<Box<dyn RecordingSession>>;
}
pub struct UnavailableRecording;
impl RecordingDriver for UnavailableRecording {
    fn support(&self) -> RecordingSupport {
        RecordingSupport {
            capture: false,
            pause: false,
        }
    }
    fn start(&self) -> DriverResult<Box<dyn RecordingSession>> {
        Err(DriverError::unsupported("原生录音"))
    }
}
