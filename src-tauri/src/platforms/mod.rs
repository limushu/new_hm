//! Compile-time driver assembly; subsystem code does not choose operating systems.
#[cfg(desktop)]
pub(crate) mod desktop;
#[cfg(mobile)]
mod mobile;
use hm_runtime::platform::{DocumentDriver, ExternalOpenDriver, HostDriver, LocalFilesystemDriver};
use hm_runtime::RuntimeManifest;
use std::sync::Arc;

pub struct NativeDrivers {
    pub host: Box<dyn HostDriver>,
    pub external_open: Box<dyn ExternalOpenDriver>,
    pub local_filesystem: Box<dyn LocalFilesystemDriver>,
    pub documents: Arc<dyn DocumentDriver>,
    pub sync: Arc<dyn hm_runtime::platform::SyncDriver>,
    manifest: RuntimeManifest,
}
impl NativeDrivers {
    pub fn manifest(&self) -> RuntimeManifest {
        self.manifest.clone()
    }
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Manager;
    #[cfg(desktop)]
    let drivers = NativeDrivers {
        host: Box::new(desktop::DesktopPlatform(app.handle().clone())),
        external_open: Box::new(desktop::DesktopPlatform(app.handle().clone())),
        local_filesystem: Box::new(desktop::DesktopPlatform(app.handle().clone())),
        documents: Arc::new(desktop::documents::DesktopDocuments(app.handle().clone())),
        sync: Arc::new(hm_runtime::platform::UnavailableSync),
        manifest: RuntimeManifest::desktop(),
    };
    #[cfg(mobile)]
    let manifest = {
        #[allow(unused_mut)]
        let mut manifest = RuntimeManifest::mobile();
        #[cfg(target_os = "ios")]
        if let Some(identity) = manifest
            .subsystems
            .iter_mut()
            .find(|s| s.id == hm_runtime::SubsystemId::Identity)
        {
            identity.state = hm_runtime::Availability::Ready;
            identity.capabilities = vec![hm_runtime::Capability::AccountLogin];
        }
        #[cfg(target_os = "ios")]
        if let Some(documents) = manifest
            .subsystems
            .iter_mut()
            .find(|s| s.id == hm_runtime::SubsystemId::Documents)
        {
            documents.state = hm_runtime::Availability::Ready;
            documents.capabilities = vec![
                hm_runtime::Capability::FilePicker,
                hm_runtime::Capability::FileExport,
            ];
        }
        #[cfg(target_os = "ios")]
        if let Some(recording) = manifest
            .subsystems
            .iter_mut()
            .find(|s| s.id == hm_runtime::SubsystemId::Recording)
        {
            recording.state = hm_runtime::Availability::Ready;
            recording.capabilities = vec![hm_runtime::Capability::RecordAudio];
        }
        #[cfg(target_os = "ios")]
        if let Some(speech) = manifest
            .subsystems
            .iter_mut()
            .find(|s| s.id == hm_runtime::SubsystemId::Speech)
        {
            speech.state = hm_runtime::Availability::Ready;
            speech.capabilities = vec![hm_runtime::Capability::TranscribeAudio];
        }
        #[cfg(target_os = "ios")]
        if let Some(backup) = manifest
            .subsystems
            .iter_mut()
            .find(|s| s.id == hm_runtime::SubsystemId::Backup)
        {
            backup
                .capabilities
                .push(hm_runtime::Capability::BackupFiles);
        }
        manifest
    };
    #[cfg(mobile)]
    let drivers = NativeDrivers {
        host: Box::new(mobile::SandboxPlatform),
        external_open: Box::new(mobile::SandboxPlatform),
        local_filesystem: Box::new(mobile::SandboxPlatform),
        #[cfg(target_os = "ios")]
        documents: Arc::from(tauri_plugin_hm_documents::driver(app.handle())),
        #[cfg(not(target_os = "ios"))]
        documents: Arc::new(mobile::documents::UnavailableDocuments),
        #[cfg(target_os = "ios")]
        sync: Arc::from(tauri_plugin_hm_cloudkit::driver(app.handle())),
        #[cfg(not(target_os = "ios"))]
        sync: Arc::new(hm_runtime::platform::UnavailableSync),
        manifest,
    };
    #[cfg(target_os = "ios")]
    let recording = tauri_plugin_hm_recording::driver(app.handle());
    #[cfg(not(target_os = "ios"))]
    let recording = Box::new(hm_runtime::platform::UnavailableRecording);
    app.manage(crate::subsystems::recording::RecordingState(
        std::sync::Mutex::new(hm_application::recording::RecordingService::new(recording)),
    ));
    #[cfg(target_os = "ios")]
    let speech = tauri_plugin_hm_speech::driver(app.handle());
    #[cfg(not(target_os = "ios"))]
    let speech = Box::new(hm_runtime::platform::UnavailableSpeech);
    app.manage(crate::subsystems::speech::SpeechState(
        std::sync::Mutex::new(hm_application::speech::SpeechService::new(speech)),
    ));
    let backup: Box<dyn hm_runtime::platform::BackupDriver> = if drivers
        .manifest
        .require(hm_runtime::Capability::BackupFiles)
        .is_ok()
    {
        Box::new(hm_runtime::platform::FileBackupDriver(
            drivers.documents.clone(),
        ))
    } else {
        Box::new(hm_runtime::platform::UnavailableBackup)
    };
    app.manage(crate::subsystems::backup::BackupState(
        std::sync::Mutex::new(hm_application::backup::BackupService::new(backup)),
    ));
    app.manage(drivers);
    #[cfg(target_os = "ios")]
    let identity = tauri_plugin_hm_identity::driver(app.handle());
    #[cfg(not(target_os = "ios"))]
    let identity = Box::new(hm_runtime::platform::UnavailableIdentity);
    crate::subsystems::identity::setup(app, identity)?;
    Ok(())
}
