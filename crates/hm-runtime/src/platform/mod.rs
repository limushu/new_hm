mod agenda;
pub use agenda::{
    Authorization, CalendarCopy, CalendarDriver, CalendarSupport, CalendarTarget,
    DeviceNotification, LocalDateTime, NotificationDriver, NotificationMode, NotificationRecord,
    NotificationSupport, UnavailableCalendar, UnavailableNotifications,
};
mod backup;
mod documents;
pub use backup::{BackupDriver, FileBackupDriver, UnavailableBackup};
mod error;
mod identity;
pub use identity::{IdentityDriver, UnavailableIdentity};
mod recording;
mod speech;
mod sync;
pub use documents::{Document, DocumentDriver};
pub use error::{DriverError, DriverErrorKind, DriverResult};
pub use recording::{
    RecordingDriver, RecordingSession, RecordingState, RecordingSupport, UnavailableRecording,
};
pub use speech::{
    SpeechDriver, SpeechJob, SpeechPhase, SpeechSegment, SpeechSnapshot, SpeechSupport,
    UnavailableSpeech,
};
pub use sync::{
    CloudIdentity, ReplicaIdentity, SyncDriver, SyncHead, SyncSession, SyncSupport, UnavailableSync,
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
        manifest
            .subsystems
            .iter_mut()
            .find(|s| s.id == crate::SubsystemId::Updates)
            .unwrap()
            .capabilities
            .push(Capability::SignedUpdates);
        assert!(manifest.require(Capability::SignedUpdates).is_err());
    }
}
