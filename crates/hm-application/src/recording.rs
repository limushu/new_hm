use hm_core::{MaterialTarget, Store};
use hm_runtime::platform::{
    Document, DriverError, DriverResult, RecordingDriver, RecordingSession, RecordingState,
};

/// One active microphone session per workspace. The host serializes calls.
pub struct RecordingService {
    driver: Box<dyn RecordingDriver>,
    session: Option<Box<dyn RecordingSession>>,
    artifact: Option<Box<dyn Document>>,
    input_owner: Option<String>,
}
impl RecordingService {
    pub fn new(driver: Box<dyn RecordingDriver>) -> Self {
        Self {
            driver,
            session: None,
            artifact: None,
            input_owner: None,
        }
    }
    pub fn support(&self) -> hm_runtime::platform::RecordingSupport {
        self.driver.support()
    }
    pub fn start(&mut self) -> DriverResult<()> {
        self.require_owner(None)?;
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
        self.require_owner(None)?;
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
        self.require_owner(None)?;
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
        self.require_owner(None)?;
        self.finish_capture()
    }
    fn finish_capture(&mut self) -> DriverResult<String> {
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
        self.require_owner(None)?;
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
        self.require_owner(None)?;
        self.cancel_capture()
    }
    fn cancel_capture(&mut self) -> DriverResult<()> {
        if let Some(session) = self.session.as_mut() {
            session.cancel()?;
        }
        self.session = None;
        self.artifact = None;
        self.input_owner = None;
        Ok(())
    }
    fn require_owner(&self, id: Option<&str>) -> DriverResult<()> {
        if self.input_owner.as_deref() != id {
            return Err(DriverError::invalid_state("recording_pending"));
        }
        Ok(())
    }
    pub(crate) fn start_input(&mut self, id: &str) -> DriverResult<()> {
        self.start()?;
        self.input_owner = Some(id.to_owned());
        Ok(())
    }
    pub(crate) fn input_state(&self, id: &str) -> DriverResult<RecordingState> {
        self.require_owner(Some(id))?;
        self.state()
            .ok_or_else(|| DriverError::invalid_state("recording_not_started"))
    }
    /// Keep the finished source when the consumer cannot stage/start it.
    pub(crate) fn consume_input<T>(
        &mut self,
        id: &str,
        consumer: impl FnOnce(&mut dyn Document) -> DriverResult<T>,
    ) -> DriverResult<T> {
        self.require_owner(Some(id))?;
        if self.artifact.is_none() {
            self.finish_capture()?;
        }
        let result = consumer(self.artifact.as_mut().unwrap().as_mut())?;
        self.artifact = None;
        self.input_owner = None;
        Ok(result)
    }
    pub(crate) fn cancel_input(&mut self, id: &str) -> DriverResult<()> {
        if self.input_owner.as_deref() == Some(id) {
            self.cancel_capture()?;
        }
        Ok(())
    }
}
// Session implementations own the microphone and must release it on Drop.
