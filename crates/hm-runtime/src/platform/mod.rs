mod documents;
mod error;
mod recording;
pub use documents::{Document, DocumentDriver};
pub use error::{DriverError, DriverErrorKind, DriverResult};
pub use recording::{
    RecordingDriver, RecordingSession, RecordingState, RecordingSupport, UnavailableRecording,
};
mod capabilities;
mod ports;
mod sandbox;
pub use ports::{ExternalOpenDriver, HostDriver, LocalFilesystemDriver};
pub use sandbox::SandboxPlatform;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Capability, RuntimeManifest};
    use std::path::Path;
    #[test]
    fn sandbox_rejects_native_operations_even_without_ui_checks() {
        let platform = SandboxPlatform;
        assert!(platform.pick_files("import", true).is_err());
        assert!(platform.pick_folder("backup").is_err());
        assert!(platform.open_file(Path::new("/tmp/file")).is_err());
        assert!(platform.set_theme(Some("dark")).is_err());
        assert!(RuntimeManifest::mobile()
            .require(Capability::RecordAudio)
            .is_err());
        assert!(RuntimeManifest::mobile()
            .require(Capability::LocalBackup)
            .is_ok());
    }
    #[test]
    fn unsupported_subsystem_cannot_grant_capabilities() {
        let mut manifest = RuntimeManifest::mobile();
        manifest.subsystems[1]
            .capabilities
            .push(Capability::SignedUpdates);
        assert!(manifest.require(Capability::SignedUpdates).is_err());
    }
}
