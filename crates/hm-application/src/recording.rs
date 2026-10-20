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
            return Err(DriverError::invalid_state("请先保存或放弃上一段录音"));
        }
        if !self.driver.support().capture {
            return Err(DriverError::unsupported("原生录音"));
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
            return Err(DriverError::unsupported("暂停录音"));
        }
        let session = self
            .session
            .as_mut()
            .ok_or_else(|| DriverError::invalid_state("没有进行中的录音"))?;
        if session.state() != RecordingState::Recording {
            return Err(DriverError::invalid_state("当前录音不能暂停"));
        }
        session.pause()
    }
    pub fn resume(&mut self) -> DriverResult<()> {
        let session = self
            .session
            .as_mut()
            .ok_or_else(|| DriverError::invalid_state("没有进行中的录音"))?;
        if session.state() != RecordingState::Paused {
            return Err(DriverError::invalid_state("当前录音不能继续"));
        }
        session.resume()
    }
    pub fn finish(&mut self) -> DriverResult<String> {
        let session = self
            .session
            .as_mut()
            .ok_or_else(|| DriverError::invalid_state("没有进行中的录音"))?;
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
    ) -> Result<String, String> {
        let artifact = self.artifact.as_mut().ok_or("请先结束录音")?;
        let id = {
            let mut reader = artifact.open().map_err(|e| e.to_string())?;
            store
                .import_reader(target, name, &mut reader)
                .map_err(|e| e.to_string())?
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
