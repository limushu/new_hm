use hm_core::{MaterialTarget, Store};
use hm_runtime::platform::{
    Document, DriverError, DriverResult, RecordingDriver, RecordingSession, RecordingState,
};

/// One active microphone session per workspace. The host serializes calls.
pub struct RecordingService {
    driver: Box<dyn RecordingDriver>,
    session: Option<Box<dyn RecordingSession>>,
    artifact: Option<Box<dyn Document>>,
}
impl RecordingService {
    pub fn new(driver: Box<dyn RecordingDriver>) -> Self {
        Self {
            driver,
            session: None,
            artifact: None,
        }
    }
    pub fn support(&self) -> hm_runtime::platform::RecordingSupport {
        self.driver.support()
    }
    pub fn start(&mut self) -> DriverResult<()> {
        if self.session.is_some() || self.artifact.is_some() {
            return Err(DriverError::invalid_state("recording_pending"));
        }
        if !self.driver.support().capture {
            return Err(DriverError::unsupported("audio_capture"));
        }
        self.session = Some(self.driver.start()?);
        Ok(())
    }
    pub fn state(&self) -> Option<RecordingState> {
        if self.artifact.is_some() {
            Some(RecordingState::Finished)
        } else {
            self.session.as_ref().map(|session| session.state())
        }
    }
    pub fn pause(&mut self) -> DriverResult<()> {
        if !self.driver.support().pause {
            return Err(DriverError::unsupported("audio_pause"));
        }
        let session = self
            .session
            .as_mut()
            .ok_or_else(|| DriverError::invalid_state("recording_not_started"))?;
        if session.state() != RecordingState::Recording {
            return Err(DriverError::invalid_state("recording_cannot_pause"));
        }
        session.pause()
    }
    pub fn resume(&mut self) -> DriverResult<()> {
        let session = self
            .session
            .as_mut()
            .ok_or_else(|| DriverError::invalid_state("recording_not_started"))?;
        if session.state() != RecordingState::Paused {
            return Err(DriverError::invalid_state("recording_cannot_resume"));
        }
        session.resume()
    }
    pub fn finish(&mut self) -> DriverResult<String> {
        let session = self
            .session
            .as_mut()
            .ok_or_else(|| DriverError::invalid_state("recording_not_started"))?;
        let artifact = session.finish()?;
        let name = artifact.name().to_owned();
        self.artifact = Some(artifact);
        self.session = None; // Drop releases the microphone.
        Ok(name)
    }
    /// Preserve the artifact on any failure so the user can retry or discard it.
    pub fn archive(
        &mut self,
        store: &Store,
        target: &MaterialTarget,
        name: &str,
    ) -> DriverResult<String> {
        let artifact = self
            .artifact
            .as_mut()
            .ok_or_else(|| DriverError::invalid_state("recording_not_finished"))?;
        let id = {
            let mut reader = artifact.open()?;
            store
                .import_reader(target, name, &mut reader)
                .map_err(crate::errors::core_error)?
        };
        self.artifact = None;
        Ok(id)
    }
    pub fn cancel(&mut self) -> DriverResult<()> {
        if let Some(session) = self.session.as_mut() {
            session.cancel()?;
        }
        self.session = None;
        self.artifact = None;
        Ok(())
    }
}
// Session implementations own the microphone and must release it on Drop.
