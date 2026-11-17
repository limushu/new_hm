use hm_core::Store;
use hm_runtime::platform::{
    Document, DriverError, DriverResult, SpeechDriver, SpeechJob, SpeechPhase, SpeechSnapshot,
    SpeechSupport,
};
use std::{fs::File, io::Read};

pub struct AudioSource {
    pub material_id: String,
    pub name: String,
    file: File,
}
impl Document for AudioSource {
    fn name(&self) -> &str {
        &self.name
    }
    fn open(&mut self) -> DriverResult<Box<dyn Read + '_>> {
        Ok(Box::new(self.file.try_clone()?))
    }
}
pub fn audio_source(store: &Store, id: &str) -> DriverResult<AudioSource> {
    let item = store.material(id).map_err(crate::errors::core_error)?;
    let extension = std::path::Path::new(&item.name)
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if item.kind != "file"
        || ![
            "m4a", "mp3", "wav", "aac", "aif", "aiff", "caf", "ogg", "webm", "mp4",
        ]
        .contains(&extension.as_str())
    {
        return Err(DriverError::invalid_state("speech_audio_invalid"));
    }
    let file = File::open(store.material_path(id).map_err(crate::errors::core_error)?)?;
    let size = file.metadata()?.len();
    if size == 0 || size > 512 * 1024 * 1024 {
        return Err(DriverError::invalid_state("speech_audio_invalid"));
    }
    Ok(AudioSource {
        material_id: id.into(),
        name: item.name,
        file,
    })
}
struct ActiveJob {
    id: String,
    source_id: Option<String>,
    language: String,
    job: Box<dyn SpeechJob>,
}
pub struct SpeechService {
    driver: Box<dyn SpeechDriver>,
    active: Option<ActiveJob>,
    input_reservation: Option<(String, String)>,
}
impl SpeechService {
    pub fn has_pending(&self) -> bool {
        self.active.is_some() || self.input_reservation.is_some()
    }
    pub(crate) fn is_input(&self, id: &str) -> bool {
        self.active
            .as_ref()
            .is_some_and(|active| active.id == id && active.source_id.is_none())
    }
    pub fn new(driver: Box<dyn SpeechDriver>) -> Self {
        Self {
            driver,
            active: None,
            input_reservation: None,
        }
    }
    fn language(language: &str) -> DriverResult<()> {
        if !["zh-CN", "en-US"].contains(&language) {
            return Err(DriverError::invalid_state("speech_language_unsupported"));
        }
        Ok(())
    }
    pub fn support(&self, language: &str) -> DriverResult<SpeechSupport> {
        Self::language(language)?;
        self.driver.support(language)
    }
    pub fn start(
        &mut self,
        id: &str,
        mut source: AudioSource,
        language: &str,
    ) -> DriverResult<SpeechSnapshot> {
        self.start_source(id, Some(source.material_id.clone()), &mut source, language)
    }
    /// Validate a text-input operation before it opens the microphone.
    pub(crate) fn prepare_input(&self, id: &str, language: &str) -> DriverResult<()> {
        Self::language(language)?;
        if uuid::Uuid::parse_str(id).is_err() {
            return Err(DriverError::invalid_state("speech_job_invalid"));
        }
        if self.has_pending() {
            return Err(DriverError::invalid_state("speech_busy"));
        }
        let support = self.support(language)?;
        if !support.installed {
            return Err(DriverError::unsupported("speech_transcription"));
        }
        if !support.on_device {
            return Err(DriverError::invalid_state("speech_on_device_unavailable"));
        }
        if matches!(support.authorization.as_str(), "denied" | "restricted") {
            return Err(DriverError::invalid_state("speech_permission_denied"));
        }
        Ok(())
    }
    pub(crate) fn reserve_input(&mut self, id: &str, language: &str) {
        self.input_reservation = Some((id.to_owned(), language.to_owned()));
    }
    pub(crate) fn start_input(
        &mut self,
        id: &str,
        audio: &mut dyn Document,
        language: &str,
    ) -> DriverResult<SpeechSnapshot> {
        self.start_source(id, None, audio, language)
    }
    fn start_source(
        &mut self,
        id: &str,
        source_id: Option<String>,
        audio: &mut dyn Document,
        language: &str,
    ) -> DriverResult<SpeechSnapshot> {
        Self::language(language)?;
        if self
            .input_reservation
            .as_ref()
            .is_some_and(|(reserved, lang)| {
                reserved != id || lang != language || source_id.is_some()
            })
        {
            return Err(DriverError::invalid_state("speech_busy"));
        }
        if uuid::Uuid::parse_str(id).is_err() {
            return Err(DriverError::invalid_state("speech_job_invalid"));
        }
        if let Some(active) = &self.active {
            if active.id == id && active.source_id == source_id && active.language == language {
                return self.snapshot(id);
            }
            return Err(DriverError::invalid_state("speech_busy"));
        }
        let support = self.support(language)?;
        if !support.installed {
            return Err(DriverError::unsupported("speech_transcription"));
        }
        if !support.on_device {
            return Err(DriverError::invalid_state("speech_on_device_unavailable"));
        }
        let job = self.driver.start(id, audio, language)?;
        self.active = Some(ActiveJob {
            id: id.into(),
            source_id,
            language: language.into(),
            job,
        });
        self.snapshot(id)
    }
    fn active(&self, id: &str) -> DriverResult<&ActiveJob> {
        self.active
            .as_ref()
            .filter(|v| v.id == id)
            .ok_or_else(|| DriverError::invalid_state("speech_job_missing"))
    }
    pub fn snapshot(&self, id: &str) -> DriverResult<SpeechSnapshot> {
        let value = self.active(id)?.job.snapshot()?;
        value.validate()?;
        Ok(value)
    }
    pub fn cancel(&mut self, id: &str) -> DriverResult<SpeechSnapshot> {
        let active = self
            .active
            .as_mut()
            .filter(|v| v.id == id)
            .ok_or_else(|| DriverError::invalid_state("speech_job_missing"))?;
        let value = active.job.cancel()?;
        value.validate()?;
        Ok(value)
    }
    pub fn discard(&mut self, id: &str) -> DriverResult<()> {
        if self.active.as_ref().is_some_and(|v| v.id == id) {
            self.active.as_mut().unwrap().job.dispose()?;
            self.active = None;
        }
        if self
            .input_reservation
            .as_ref()
            .is_some_and(|(reserved, _)| reserved == id)
        {
            self.input_reservation = None;
        }
        Ok(())
    }
    pub fn archive(
        &self,
        store: &Store,
        id: &str,
        document_id: &str,
        name: &str,
        body: &str,
    ) -> DriverResult<String> {
        let active = self.active(id)?;
        let snapshot = self.snapshot(id)?;
        if matches!(
            snapshot.phase,
            SpeechPhase::Authorizing | SpeechPhase::Transcribing
        ) || !snapshot.has_text()
        {
            return Err(DriverError::invalid_state("speech_not_finished"));
        }
        let source_id = active
            .source_id
            .as_deref()
            .ok_or_else(|| DriverError::invalid_state("speech_source_not_archivable"))?;
        store
            .create_audio_transcript(source_id, document_id, name, body)
            .map_err(crate::errors::core_error)
    }
}
