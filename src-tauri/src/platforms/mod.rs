//! Compile-time driver assembly; subsystem code does not choose operating systems.
#[cfg(desktop)]
pub(crate) mod desktop;
#[cfg(mobile)]
mod mobile;
use hm_runtime::platform::{DocumentDriver, ExternalOpenDriver, HostDriver, LocalFilesystemDriver};
use hm_runtime::RuntimeManifest;

pub struct NativeDrivers {
    pub host: Box<dyn HostDriver>,
    pub external_open: Box<dyn ExternalOpenDriver>,
    pub local_filesystem: Box<dyn LocalFilesystemDriver>,
    pub documents: Box<dyn DocumentDriver>,
    manifest: RuntimeManifest,
}
impl NativeDrivers {
    pub fn manifest(&self) -> RuntimeManifest {
        self.manifest.clone()
    }
}

pub fn setup(app: &mut tauri::App) {
    use tauri::Manager;
    #[cfg(desktop)]
    let drivers = NativeDrivers {
        host: Box::new(desktop::DesktopPlatform(app.handle().clone())),
        external_open: Box::new(desktop::DesktopPlatform(app.handle().clone())),
        local_filesystem: Box::new(desktop::DesktopPlatform(app.handle().clone())),
        documents: Box::new(desktop::documents::DesktopDocuments(app.handle().clone())),
        manifest: RuntimeManifest::desktop(),
    };
    #[cfg(mobile)]
    let manifest = {
        #[allow(unused_mut)]
        let mut manifest = RuntimeManifest::mobile();
        #[cfg(target_os = "ios")]
        if let Some(recording) = manifest
            .subsystems
            .iter_mut()
            .find(|s| s.id == hm_runtime::SubsystemId::Recording)
        {
            recording.state = hm_runtime::Availability::Ready;
            recording.capabilities = vec![hm_runtime::Capability::RecordAudio];
        }
        manifest
    };
    #[cfg(mobile)]
    let drivers = NativeDrivers {
        host: Box::new(mobile::SandboxPlatform),
        external_open: Box::new(mobile::SandboxPlatform),
        local_filesystem: Box::new(mobile::SandboxPlatform),
        documents: Box::new(mobile::documents::UnavailableDocuments),
        manifest,
    };
    #[cfg(target_os = "ios")]
    let recording = tauri_plugin_hm_recording::driver(app.handle());
    #[cfg(not(target_os = "ios"))]
    let recording = Box::new(hm_runtime::platform::UnavailableRecording);
    app.manage(crate::subsystems::recording::RecordingState(
        std::sync::Mutex::new(hm_application::recording::RecordingService::new(recording)),
    ));
    app.manage(drivers);
}
