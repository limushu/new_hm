//! Compile-time driver assembly; subsystem code does not choose operating systems.
#[cfg(desktop)]
pub(crate) mod desktop;
#[cfg(mobile)]
mod mobile;
use hm_runtime::platform::{
    DocumentDriver, ExternalOpenDriver, HostDriver, LocalFilesystemDriver, UnavailableRecording,
};
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
    let drivers = NativeDrivers {
        host: Box::new(mobile::SandboxPlatform),
        external_open: Box::new(mobile::SandboxPlatform),
        local_filesystem: Box::new(mobile::SandboxPlatform),
        documents: Box::new(mobile::documents::UnavailableDocuments),
        manifest: RuntimeManifest::mobile(),
    };
    app.manage(crate::subsystems::recording::RecordingState(
        std::sync::Mutex::new(hm_application::recording::RecordingService::new(Box::new(
            UnavailableRecording,
        ))),
    ));
    app.manage(drivers);
}
