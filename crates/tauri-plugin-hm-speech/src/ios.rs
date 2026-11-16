use hm_runtime::platform::{
    Document, DriverError, DriverErrorKind, DriverResult, SpeechDriver, SpeechJob, SpeechSnapshot,
    SpeechSupport,
};
use serde::Deserialize;
use tauri::{plugin::PluginHandle, Manager};

tauri::ios_plugin_binding!(init_plugin_hm_speech);
#[derive(Clone)]
struct IosSpeech(PluginHandle<tauri::Wry>);
#[derive(Deserialize)]
struct Reply {
    error: Option<String>,
    support: Option<SpeechSupport>,
    snapshot: Option<SpeechSnapshot>,
}
impl IosSpeech {
    fn call(&self, command: &str, payload: serde_json::Value) -> DriverResult<Reply> {
        let reply: Reply = self
            .0
            .run_mobile_plugin(command, payload)
            .map_err(|error| DriverError {
                kind: DriverErrorKind::Io,
                code: "speech_bridge_failed".into(),
                resource: Some("speech_transcription".into()),
                detail: Some(error.to_string()),
            })?;
        if let Some(code) = reply.error {
            return Err(DriverError {
                kind: if code == "speech_permission_denied" {
                    DriverErrorKind::PermissionDenied
                } else {
                    DriverErrorKind::InvalidState
                },
                code,
                resource: Some("speech_transcription".into()),
                detail: None,
            });
        }
        Ok(reply)
    }
}
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("hm-speech")
        .setup(|app, api| {
            let handle = api.register_ios_plugin(init_plugin_hm_speech)?;
            app.manage(IosSpeech(handle));
            Ok(())
        })
        .build()
}
pub fn driver(app: &tauri::AppHandle) -> Box<dyn SpeechDriver> {
    Box::new(app.state::<IosSpeech>().inner().clone())
}
impl SpeechDriver for IosSpeech {
    fn support(&self, language: &str) -> DriverResult<SpeechSupport> {
        self.call("support", serde_json::json!({"language":language}))?
            .support
            .ok_or_else(|| DriverError::invalid_state("speech_bridge_failed"))
    }
    fn start(
        &self,
        id: &str,
        mut audio: Box<dyn Document>,
        language: &str,
    ) -> DriverResult<Box<dyn SpeechJob>> {
        let directory = tempfile::Builder::new().prefix("hm-speech-").tempdir()?;
        let extension = std::path::Path::new(audio.name())
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or("m4a")
            .to_ascii_lowercase();
        if ![
            "m4a", "mp3", "wav", "aac", "aif", "aiff", "caf", "ogg", "webm", "mp4",
        ]
        .contains(&extension.as_str())
        {
            return Err(DriverError::invalid_state("speech_audio_invalid"));
        }
        let path = directory.path().join(format!("source.{extension}"));
        let mut output = std::fs::File::create(&path)?;
        std::io::copy(&mut audio.open()?, &mut output)?;
        output.sync_all()?;
        self.call(
            "start",
            serde_json::json!({"id":id,"path":path,"language":language}),
        )?;
        Ok(Box::new(IosSpeechJob {
            bridge: self.clone(),
            id: id.into(),
            directory: Some(directory),
            disposed: false,
        }))
    }
}
struct IosSpeechJob {
    bridge: IosSpeech,
    id: String,
    directory: Option<tempfile::TempDir>,
    disposed: bool,
}
impl SpeechJob for IosSpeechJob {
    fn snapshot(&self) -> DriverResult<SpeechSnapshot> {
        self.bridge
            .call("status", serde_json::json!({"id":self.id}))?
            .snapshot
            .ok_or_else(|| DriverError::invalid_state("speech_bridge_failed"))
    }
    fn cancel(&mut self) -> DriverResult<SpeechSnapshot> {
        self.bridge
            .call("cancel", serde_json::json!({"id":self.id}))?
            .snapshot
            .ok_or_else(|| DriverError::invalid_state("speech_bridge_failed"))
    }
    fn dispose(&mut self) -> DriverResult<()> {
        if !self.disposed {
            self.bridge
                .call("discard", serde_json::json!({"id": self.id}))?;
            self.disposed = true;
            self.directory = None;
        }
        Ok(())
    }
}
impl Drop for IosSpeechJob {
    fn drop(&mut self) {
        if self.disposed {
            return;
        }
        let bridge = self.bridge.clone();
        let id = self.id.clone();
        let directory = self.directory.take();
        // State teardown can happen on the UI thread. Keep the staged source
        // until the native task has acknowledged disposal; never synchronously wait.
        tauri::async_runtime::spawn(async move {
            let _ = bridge
                .0
                .run_mobile_plugin_async::<Reply>("discard", serde_json::json!({"id":id}))
                .await;
            drop(directory);
        });
    }
}
