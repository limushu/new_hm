//! Provider-neutral replica transport. Login identities and storage locations are distinct.
use super::{DriverError, DriverResult};
use serde::{Deserialize, Serialize};
use std::{io::Read, sync::Arc};
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSupport {
    pub installed: bool,
    pub configured: bool,
}

/// Subject is an opaque provider ID, never an email address or credential.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudIdentity {
    pub provider: String,
    pub subject: String,
}
/// Verified application identity and workspace are separate from the authorized storage account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplicaIdentity {
    pub user_id: String,
    pub workspace_id: String,
    pub storage: CloudIdentity,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncHead {
    pub revision: String,
    /// Provider generation / CloudKit change tag. Opaque to the business layer.
    pub version: String,
}

pub trait SyncDriver: Send + Sync {
    fn support(&self) -> DriverResult<SyncSupport> {
        Ok(SyncSupport {
            installed: self.provider().is_some(),
            configured: false,
        })
    }
    /// Installation only; configuration and account readiness are separate.
    fn provider(&self) -> Option<&'static str> {
        None
    }
    /// Discover the authorized storage account before creating a workspace binding.
    fn storage_account(&self) -> DriverResult<CloudIdentity> {
        Err(DriverError::unsupported("cloud_account"))
    }
    /// Opens a session bound to the authorized cloud account. A provider must
    /// invalidate it on account changes, never silently switch credentials.
    fn open(&self, identity: &ReplicaIdentity) -> DriverResult<Box<dyn SyncSession>>;
}
impl<T: SyncDriver + ?Sized> SyncDriver for Arc<T> {
    fn support(&self) -> DriverResult<SyncSupport> {
        (**self).support()
    }
    fn provider(&self) -> Option<&'static str> {
        (**self).provider()
    }
    fn storage_account(&self) -> DriverResult<CloudIdentity> {
        (**self).storage_account()
    }
    fn open(&self, identity: &ReplicaIdentity) -> DriverResult<Box<dyn SyncSession>> {
        (**self).open(identity)
    }
}
pub trait SyncSession: Send {
    fn identity(&self) -> &ReplicaIdentity;
    fn head(&mut self) -> DriverResult<Option<SyncHead>>;
    fn has_blob(&mut self, digest: &str) -> DriverResult<bool>;
    /// Immutable and idempotent; no overwriting a blob addressed by its hash.
    fn put_blob(&mut self, digest: &str, source: &mut dyn Read) -> DriverResult<u64>;
    /// Reader owns its network / native staging resources until dropped.
    fn get_blob(&mut self, digest: &str) -> DriverResult<Box<dyn Read>>;
    /// Atomic compare-and-swap, including expected absence for first creation.
    /// None means another device changed the head; do not overwrite it.
    fn publish(
        &mut self,
        expected: Option<&SyncHead>,
        revision: &str,
    ) -> DriverResult<Option<SyncHead>>;
}
pub struct UnavailableSync;
impl SyncDriver for UnavailableSync {
    fn open(&self, _: &ReplicaIdentity) -> DriverResult<Box<dyn SyncSession>> {
        Err(DriverError::unsupported("cloud_sync"))
    }
}
