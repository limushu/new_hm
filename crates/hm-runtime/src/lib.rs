//! Host subsystem contracts and lifecycle, independent of Tauri and business storage.
mod lifecycle;
pub use lifecycle::{ActivityGate, WorkerScope};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Capability {
    Tray,
    Autostart,
    WindowTheme,
    NativeDrop,
    SignedUpdates,
    BackgroundMaintenance,
    ForegroundMaintenance,
    FilePicker,
    FileExport,
    ExternalOpen,
    RecordAudio,
    LocalBackup,
    BackupTransfer,
    SystemNotifications,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SubsystemId {
    Host,
    Updates,
    Maintenance,
    Documents,
    Recording,
    Backup,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Availability {
    Ready,
    Unsupported,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsystemDescriptor {
    pub id: SubsystemId,
    pub state: Availability,
    pub capabilities: Vec<Capability>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeManifest {
    pub version: u8,
    pub subsystems: Vec<SubsystemDescriptor>,
}

impl RuntimeManifest {
    /// Advertise only adapters installed successfully by the desktop composition root.
    /// Mobile adapters must provide their own manifest after setup succeeds.
    pub fn desktop() -> Self {
        Self {
            version: 1,
            subsystems: vec![
                SubsystemDescriptor {
                    id: SubsystemId::Host,
                    state: Availability::Ready,
                    capabilities: vec![
                        Capability::Tray,
                        Capability::Autostart,
                        Capability::WindowTheme,
                    ],
                },
                SubsystemDescriptor {
                    id: SubsystemId::Updates,
                    state: Availability::Ready,
                    capabilities: vec![Capability::SignedUpdates],
                },
                SubsystemDescriptor {
                    id: SubsystemId::Maintenance,
                    state: Availability::Ready,
                    capabilities: vec![
                        Capability::BackgroundMaintenance,
                        Capability::SystemNotifications,
                    ],
                },
                SubsystemDescriptor {
                    id: SubsystemId::Documents,
                    state: Availability::Ready,
                    capabilities: vec![
                        Capability::NativeDrop,
                        Capability::FilePicker,
                        Capability::FileExport,
                        Capability::ExternalOpen,
                    ],
                },
                SubsystemDescriptor {
                    id: SubsystemId::Recording,
                    state: Availability::Ready,
                    capabilities: vec![Capability::RecordAudio],
                },
                SubsystemDescriptor {
                    id: SubsystemId::Backup,
                    state: Availability::Ready,
                    capabilities: vec![Capability::LocalBackup, Capability::BackupTransfer],
                },
            ],
        }
    }

    /// Advertise only installed mobile adapters; desktop operations remain absent.
    pub fn mobile() -> Self {
        Self {
            version: 1,
            subsystems: vec![
                SubsystemDescriptor {
                    id: SubsystemId::Host,
                    state: Availability::Ready,
                    capabilities: vec![],
                },
                SubsystemDescriptor {
                    id: SubsystemId::Updates,
                    state: Availability::Unsupported,
                    capabilities: vec![],
                },
                SubsystemDescriptor {
                    id: SubsystemId::Maintenance,
                    state: Availability::Ready,
                    capabilities: vec![Capability::ForegroundMaintenance],
                },
                SubsystemDescriptor {
                    id: SubsystemId::Documents,
                    state: Availability::Unsupported,
                    capabilities: vec![],
                },
                SubsystemDescriptor {
                    id: SubsystemId::Recording,
                    state: Availability::Unsupported,
                    capabilities: vec![],
                },
                SubsystemDescriptor {
                    id: SubsystemId::Backup,
                    state: Availability::Ready,
                    capabilities: vec![Capability::LocalBackup],
                },
            ],
        }
    }
}

pub mod platform;
pub use platform::SandboxPlatform;
