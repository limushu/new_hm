use hm_runtime::platform::{
    Document, DriverError, DriverErrorKind, DriverResult, RecordingDriver, RecordingSession,
    RecordingState, RecordingSupport,
};
use serde::Deserialize;
use std::{fs::File, io::Read};
use tauri::{plugin::PluginHandle, Manager};

tauri::ios_plugin_binding!(init_plugin_hm_recording);

#[derive(Clone)]
struct IosRecording(PluginHandle<tauri::Wry>);

#[derive(Deserialize)]
struct Reply {
    error: Option<String>,
    state: Option<String>,
}

impl IosRecording {
    fn call(&self, command: &str, payload: serde_json::Value) -> DriverResult<Reply> {
        let reply: Reply = self
            .0
            .run_mobile_plugin(command, payload)
            .map_err(|error| DriverError {
                kind: DriverErrorKind::Io,
                code: "recording_failed".into(),
                resource: Some("audio_capture".into()),
                detail: Some(error.to_string()),
            })?;
        if let Some(code) = &reply.error {
            return Err(DriverError {
                kind: if code == "microphone_permission_denied" {
                    DriverErrorKind::PermissionDenied
                } else {
                    DriverErrorKind::InvalidState
                },
                code: code.clone(),
                resource: Some("audio_capture".into()),
                detail: None,
            });
        }
        Ok(reply)
    }
}

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("hm-recording")
        .setup(|app, api| {
            let handle = api.register_ios_plugin(init_plugin_hm_recording)?;
            app.manage(IosRecording(handle));
            Ok(())
        })
        .build()
}

pub fn driver(app: &tauri::AppHandle) -> Box<dyn RecordingDriver> {
    Box::new(app.state::<IosRecording>().inner().clone())
}

impl RecordingDriver for IosRecording {
    fn support(&self) -> RecordingSupport {
        RecordingSupport {
            capture: true,
            pause: true,
        }
    }

    fn start(&self) -> DriverResult<Box<dyn RecordingSession>> {
        let directory = tempfile::Builder::new().prefix("hm-recording-").tempdir()?;
        self.call(
            "start",
            serde_json::json!({"path": directory.path().join("capture.m4a")}),
        )?;
        Ok(Box::new(IosSession {
            bridge: self.clone(),
            directory: Some(directory),
            live: true,
        }))
    }
}

struct IosSession {
    bridge: IosRecording,
    directory: Option<tempfile::TempDir>,
    live: bool,
}

impl RecordingSession for IosSession {
    fn state(&self) -> RecordingState {
        match self
            .bridge
            .call("status", serde_json::json!({}))
            .ok()
            .and_then(|r| r.state)
            .as_deref()
        {
            Some("recording") => RecordingState::Recording,
            Some("paused") => RecordingState::Paused,
            _ => RecordingState::Interrupted,
        }
    }
    fn pause(&mut self) -> DriverResult<()> {
        self.bridge.call("pause", serde_json::json!({}))?;
        Ok(())
    }
    fn resume(&mut self) -> DriverResult<()> {
        self.bridge.call("resume", serde_json::json!({}))?;
        Ok(())
    }
    fn finish(&mut self) -> DriverResult<Box<dyn Document>> {
        self.bridge.call("finish", serde_json::json!({}))?;
        let directory = self
            .directory
            .as_ref()
            .ok_or_else(|| DriverError::invalid_state("recording_not_started"))?;
        if directory.path().join("capture.m4a").metadata()?.len() == 0 {
            return Err(DriverError::invalid_state("recording_empty"));
        }
        self.live = false;
        Ok(Box::new(CapturedAudio(self.directory.take().unwrap())))
    }
    fn cancel(&mut self) -> DriverResult<()> {
        self.bridge.call("cancel", serde_json::json!({}))?;
        self.live = false;
        Ok(())
    }
}

impl Drop for IosSession {
    fn drop(&mut self) {
        if self.live {
            // App teardown may drop state on the UI thread. Do not synchronously
            // wait there for a Swift callback dispatched to that same thread.
            let bridge = self.bridge.clone();
            let directory = self.directory.take();
            tauri::async_runtime::spawn(async move {
                let _ = bridge
                    .0
                    .run_mobile_plugin_async::<Reply>("cancel", serde_json::json!({}))
                    .await;
                drop(directory);
            });
        }
    }
}

/// The application archives a stream. Its temporary source survives archive
/// failures and is removed only after successful import or explicit discard.
struct CapturedAudio(tempfile::TempDir);
impl Document for CapturedAudio {
    fn name(&self) -> &str {
        "recording.m4a"
    }
    fn open(&mut self) -> DriverResult<Box<dyn Read + '_>> {
        Ok(Box::new(File::open(self.0.path().join("capture.m4a"))?))
    }
}
