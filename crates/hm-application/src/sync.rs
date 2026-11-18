//! Offline-first replica synchronization. No Tauri, OAuth, Apple SDK or cloud paths.
mod lease;
use crate::{backup::BackupSummary, errors::core_error};
use hm_core::{SyncSnapshot, SyncSnapshotManifest};
use hm_runtime::platform::{
    DriverError, DriverResult, ReplicaIdentity, SyncDriver, SyncHead, SyncSession,
};
pub use lease::{SyncActivity, SyncEpoch};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
};

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn valid_digest(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn invalid() -> DriverError {
    DriverError::invalid_state("sync_data_invalid")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Revision {
    format: u8,
    id: String,
    owner_id: String,
    workspace_id: String,
    manifest: String,
    fingerprint: String,
    parents: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Baseline {
    revision: String,
    fingerprint: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreservedVersion {
    pub revision: String,
    pub created_at: String,
    pub case_count: usize,
    pub file_count: usize,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalState {
    format: u8,
    enabled: bool,
    account: Option<ReplicaIdentity>,
    baseline: Option<Baseline>,
    preserved: Vec<PreservedVersion>,
}
impl Default for LocalState {
    fn default() -> Self {
        Self {
            format: 1,
            enabled: false,
            account: None,
            baseline: None,
            preserved: vec![],
        }
    }
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict {
    pub token: String,
    pub local: BackupSummary,
    pub remote: BackupSummary,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub phase: &'static str,
    pub conflict: Option<SyncConflict>,
    pub incoming: Option<IncomingVersion>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingVersion {
    pub token: String,
    pub summary: BackupSummary,
}
struct PendingIncoming {
    token: String,
    head: SyncHead,
    expected_local: String,
    snapshot: SyncSnapshot,
}
fn report(phase: &'static str) -> SyncReport {
    SyncReport {
        phase,
        conflict: None,
        incoming: None,
    }
}

pub struct SyncService {
    driver: Box<dyn SyncDriver>,
    identity: ReplicaIdentity,
    state_path: PathBuf,
    state: LocalState,
    conflict_head: Option<(String, SyncHead)>,
    pending: Option<PendingIncoming>,
}
impl SyncService {
    pub fn open(
        driver: Box<dyn SyncDriver>,
        private_directory: &Path,
        identity: ReplicaIdentity,
    ) -> DriverResult<Self> {
        std::fs::create_dir_all(private_directory)?;
        let state_path = private_directory.join("sync-device-state.json");
        let state = if state_path.exists() {
            if std::fs::metadata(&state_path)?.len() > 1024 * 1024 {
                return Err(invalid());
            }
            let state: LocalState =
                serde_json::from_slice(&std::fs::read(&state_path)?).map_err(|_| invalid())?;
            if state.format != 1 {
                return Err(invalid());
            }
            state
        } else {
            LocalState::default()
        };
        Ok(Self {
            driver,
            identity,
            state_path,
            state,
            conflict_head: None,
            pending: None,
        })
    }
    fn persist(&mut self, state: LocalState) -> DriverResult<()> {
        let mut file =
            tempfile::NamedTempFile::new_in(self.state_path.parent().ok_or_else(invalid)?)?;
        file.write_all(&serde_json::to_vec(&state).map_err(|_| invalid())?)?;
        file.flush()?;
        file.as_file().sync_all()?;
        file.persist(&self.state_path)
            .map_err(|e| DriverError::from(e.error))?;
        self.state = state;
        Ok(())
    }
    pub fn enabled(&self) -> bool {
        self.state.enabled
    }
    pub fn stored_identity(private_directory: &Path) -> DriverResult<Option<ReplicaIdentity>> {
        let path = private_directory.join("sync-device-state.json");
        if !path.exists() {
            return Ok(None);
        }
        if std::fs::metadata(&path)?.len() > 1024 * 1024 {
            return Err(invalid());
        }
        let state: LocalState =
            serde_json::from_slice(&std::fs::read(path)?).map_err(|_| invalid())?;
        if state.format != 1 {
            return Err(invalid());
        }
        Ok(state.account)
    }
    pub fn enable(&mut self) -> DriverResult<ReplicaIdentity> {
        let session = self.driver.open(&self.identity)?;
        let account = session.identity().clone();
        if account != self.identity {
            return Err(DriverError::invalid_state("sync_account_changed"));
        }
        if account.storage.provider.is_empty()
            || account.storage.subject.is_empty()
            || uuid::Uuid::parse_str(&account.user_id).is_err()
            || uuid::Uuid::parse_str(&account.workspace_id).is_err()
        {
            return Err(invalid());
        }
        if self
            .state
            .account
            .as_ref()
            .is_some_and(|bound| bound != &account)
        {
            return Err(DriverError::invalid_state("sync_account_changed"));
        }
        let mut next = self.state.clone();
        next.enabled = true;
        next.account = Some(account.clone());
        self.persist(next)?;
        Ok(account)
    }
    pub fn disable(&mut self) -> DriverResult<()> {
        let mut next = self.state.clone();
        next.enabled = false;
        self.persist(next)?;
        self.conflict_head = None;
        self.pending = None;
        Ok(())
    }
    pub fn require_reconciliation(&mut self) -> DriverResult<()> {
        let mut state = self.state.clone();
        state.baseline = None;
        self.persist(state)?;
        self.pending = None;
        self.conflict_head = None;
        Ok(())
    }
    pub fn preserved_versions(&self) -> &[PreservedVersion] {
        &self.state.preserved
    }
    /// Explicit recovery/read of an indexed conflict version; does not move the cloud head.
    pub fn preserved_snapshot(&self, revision: &str) -> DriverResult<SyncSnapshot> {
        if !self.state.preserved.iter().any(|v| v.revision == revision) {
            return Err(DriverError::invalid_state("sync_version_missing"));
        }
        let mut session = self.session()?;
        let (_, manifest) = Self::revision(
            session.as_mut(),
            &SyncHead {
                revision: revision.into(),
                version: String::new(),
            },
        )?;
        Self::pull(session.as_mut(), manifest)
    }
    fn session(&self) -> DriverResult<Box<dyn SyncSession>> {
        let session = self.driver.open(&self.identity)?;
        if self.state.account.as_ref() != Some(session.identity())
            || session.identity() != &self.identity
        {
            return Err(DriverError::invalid_state("sync_account_changed"));
        }
        Ok(session)
    }
    fn read_bytes(session: &mut dyn SyncSession, hash: &str, limit: u64) -> DriverResult<Vec<u8>> {
        if !valid_digest(hash) {
            return Err(invalid());
        }
        let mut bytes = vec![];
        session
            .get_blob(hash)?
            .take(limit + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 > limit || digest(&bytes) != hash {
            return Err(invalid());
        }
        Ok(bytes)
    }
    fn revision(
        session: &mut dyn SyncSession,
        head: &SyncHead,
    ) -> DriverResult<(Revision, SyncSnapshotManifest)> {
        let bytes = Self::read_bytes(session, &head.revision, 64 * 1024)?;
        let revision: Revision = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
        if revision.owner_id != session.identity().user_id
            || revision.workspace_id != session.identity().workspace_id
        {
            return Err(DriverError::invalid_state("sync_scope_mismatch"));
        }
        if revision.format != 1
            || uuid::Uuid::parse_str(&revision.id).is_err()
            || !valid_digest(&revision.fingerprint)
            || revision.parents.len() > 8
            || revision.parents.iter().any(|p| !valid_digest(p))
        {
            return Err(invalid());
        }
        let bytes = Self::read_bytes(session, &revision.manifest, 16 * 1024 * 1024)?;
        let manifest = SyncSnapshotManifest::parse(&bytes).map_err(core_error)?;
        if manifest.fingerprint != revision.fingerprint {
            return Err(invalid());
        }
        Ok((revision, manifest))
    }
    fn put_bytes(session: &mut dyn SyncSession, bytes: Vec<u8>) -> DriverResult<String> {
        let hash = digest(&bytes);
        if !session.has_blob(&hash)?
            && session.put_blob(&hash, &mut Cursor::new(&bytes))? != bytes.len() as u64
        {
            return Err(DriverError::invalid_state("sync_upload_incomplete"));
        }
        Ok(hash)
    }
    fn stage(
        session: &mut dyn SyncSession,
        local: &SyncSnapshot,
        parents: Vec<String>,
    ) -> DriverResult<String> {
        let mut seen = BTreeSet::new();
        for (name, hash) in local.manifest.files() {
            if seen.insert(hash) && !session.has_blob(hash)? {
                let mut source = local.file(name).map_err(core_error)?;
                let size = source.metadata()?.len();
                if session.put_blob(hash, &mut source)? != size {
                    return Err(DriverError::invalid_state("sync_upload_incomplete"));
                }
            }
        }
        let manifest = Self::put_bytes(session, local.manifest.bytes().map_err(core_error)?)?;
        let revision = Revision {
            format: 1,
            id: uuid::Uuid::new_v4().to_string(),
            owner_id: session.identity().user_id.clone(),
            workspace_id: session.identity().workspace_id.clone(),
            manifest,
            fingerprint: local.manifest.fingerprint.clone(),
            parents,
        };
        Self::put_bytes(
            session,
            serde_json::to_vec(&revision).map_err(|_| invalid())?,
        )
    }
    fn advance(&mut self, revision: String, fingerprint: String) -> DriverResult<()> {
        let mut next = self.state.clone();
        next.baseline = Some(Baseline {
            revision,
            fingerprint,
        });
        self.persist(next)?;
        self.conflict_head = None;
        self.pending = None;
        Ok(())
    }
    fn preserve(&mut self, revision: String, summary: BackupSummary) -> DriverResult<()> {
        let mut next = self.state.clone();
        next.preserved.push(PreservedVersion {
            revision,
            created_at: summary.created_at,
            case_count: summary.case_count,
            file_count: summary.file_count,
        });
        // Never delete remote data here. This is a local index of recent conflict versions.
        if next.preserved.len() > 100 {
            next.preserved.remove(0);
        }
        self.persist(next)
    }
    fn pull(
        session: &mut dyn SyncSession,
        manifest: SyncSnapshotManifest,
    ) -> DriverResult<SyncSnapshot> {
        SyncSnapshot::from_remote(manifest, |hash| {
            session
                .get_blob(hash)
                .map_err(|e| hm_core::Error::Validation(e.code))
        })
        .map_err(core_error)
    }
    /// Snapshot is created with the workspace locked; network work runs after that lock is released.
    /// The apply callback re-locks the workspace and checks expected_local before any replacement.
    pub fn synchronize(
        &mut self,
        local: &SyncSnapshot,
        mut apply: impl FnMut(&SyncSnapshot, &str) -> DriverResult<()>,
    ) -> DriverResult<SyncReport> {
        self.synchronize_inner(local, false, &mut apply)
    }
    /// Download and verify in the background. Replacement is a separate local
    /// commit so the host can preserve open editors before applying incoming data.
    pub fn prepare_synchronize(&mut self, local: &SyncSnapshot) -> DriverResult<SyncReport> {
        if let Some(pending) = &self.pending {
            if pending.expected_local == local.manifest.fingerprint {
                return Ok(self.incoming_report());
            }
            self.pending = None;
        }
        self.synchronize_inner(local, true, &mut |_, _| Err(invalid()))
    }
    fn incoming_report(&self) -> SyncReport {
        let pending = self.pending.as_ref().expect("prepared incoming version");
        SyncReport {
            phase: "incoming",
            conflict: None,
            incoming: Some(IncomingVersion {
                token: pending.token.clone(),
                summary: (&pending.snapshot.info()).into(),
            }),
        }
    }
    fn accept_incoming(
        &mut self,
        incoming: SyncSnapshot,
        head: SyncHead,
        local: &str,
        deferred: bool,
        apply: &mut impl FnMut(&SyncSnapshot, &str) -> DriverResult<()>,
    ) -> DriverResult<SyncReport> {
        if deferred {
            self.pending = Some(PendingIncoming {
                token: uuid::Uuid::new_v4().to_string(),
                head,
                expected_local: local.into(),
                snapshot: incoming,
            });
            return Ok(self.incoming_report());
        }
        apply(&incoming, local)?;
        self.advance(head.revision, incoming.manifest.fingerprint.clone())?;
        Ok(report("downloaded"))
    }
    pub fn apply_prepared(
        &mut self,
        token: &str,
        mut apply: impl FnMut(&SyncSnapshot, &str) -> DriverResult<()>,
    ) -> DriverResult<SyncReport> {
        if !self.enabled() {
            return Err(DriverError::invalid_state("sync_disabled"));
        }
        let pending = self
            .pending
            .as_ref()
            .filter(|p| p.token == token)
            .ok_or_else(|| DriverError::invalid_state("sync_incoming_expired"))?;
        apply(&pending.snapshot, &pending.expected_local)?;
        let revision = pending.head.revision.clone();
        let fingerprint = pending.snapshot.manifest.fingerprint.clone();
        self.advance(revision, fingerprint)?;
        Ok(report("downloaded"))
    }
    fn synchronize_inner(
        &mut self,
        local: &SyncSnapshot,
        deferred: bool,
        apply: &mut impl FnMut(&SyncSnapshot, &str) -> DriverResult<()>,
    ) -> DriverResult<SyncReport> {
        if !self.enabled() {
            return Ok(report("disabled"));
        }
        let mut session = self.session()?;
        let head = session.head()?;
        let Some(head) = head else {
            if self.state.baseline.is_some() {
                return Err(DriverError::invalid_state("sync_remote_reset"));
            }
            let revision = Self::stage(session.as_mut(), local, vec![])?;
            if session.publish(None, &revision)?.is_none() {
                return Ok(report("retry"));
            }
            self.advance(revision, local.manifest.fingerprint.clone())?;
            return Ok(report("uploaded"));
        };
        let (_, manifest) = Self::revision(session.as_mut(), &head)?;
        if manifest.fingerprint == local.manifest.fingerprint {
            self.advance(head.revision, manifest.fingerprint)?;
            return Ok(report("current"));
        }
        let baseline = self.state.baseline.clone();
        let dirty = baseline
            .as_ref()
            .is_none_or(|base| base.fingerprint != local.manifest.fingerprint);
        if baseline
            .as_ref()
            .is_some_and(|base| base.revision == head.revision)
        {
            let revision = Self::stage(session.as_mut(), local, vec![head.revision.clone()])?;
            if session.publish(Some(&head), &revision)?.is_none() {
                return Ok(report("retry"));
            }
            self.advance(revision, local.manifest.fingerprint.clone())?;
            return Ok(report("uploaded"));
        }
        if !dirty || (baseline.is_none() && local.pristine) {
            let incoming = Self::pull(session.as_mut(), manifest)?;
            return self.accept_incoming(
                incoming,
                head,
                &local.manifest.fingerprint,
                deferred,
                apply,
            );
        }
        let token = uuid::Uuid::new_v4().to_string();
        self.conflict_head = Some((token.clone(), head));
        Ok(SyncReport {
            phase: "conflict",
            incoming: None,
            conflict: Some(SyncConflict {
                token,
                local: (&local.info()).into(),
                remote: BackupSummary {
                    created_at: manifest.created_at().into(),
                    case_count: manifest.case_count(),
                    file_count: manifest.files().len() - 1,
                },
            }),
        })
    }
    /// Both versions are durably stored before a user-selected resolution can replace data.
    pub fn resolve(
        &mut self,
        token: &str,
        use_local: bool,
        local: &SyncSnapshot,
        mut apply: impl FnMut(&SyncSnapshot, &str) -> DriverResult<()>,
    ) -> DriverResult<SyncReport> {
        if !self.enabled() {
            return Err(DriverError::invalid_state("sync_disabled"));
        }
        let expected = self
            .conflict_head
            .as_ref()
            .filter(|(id, _)| id == token)
            .map(|(_, head)| head.clone())
            .ok_or_else(|| DriverError::invalid_state("sync_conflict_expired"))?;
        let mut session = self.session()?;
        if session.head()?.as_ref() != Some(&expected) {
            self.conflict_head = None;
            return Err(DriverError::invalid_state("sync_conflict_expired"));
        }
        let (_, remote_manifest) = Self::revision(session.as_mut(), &expected)?;
        let local_revision = Self::stage(
            session.as_mut(),
            local,
            self.state
                .baseline
                .as_ref()
                .map(|b| vec![b.revision.clone()])
                .unwrap_or_default(),
        )?;
        // Write the index before changing a head or applying remote data. A failed write stops resolution.
        self.preserve(local_revision.clone(), (&local.info()).into())?;
        self.preserve(
            expected.revision.clone(),
            BackupSummary {
                created_at: remote_manifest.created_at().into(),
                case_count: remote_manifest.case_count(),
                file_count: remote_manifest.files().len() - 1,
            },
        )?;
        if use_local {
            let revision = Self::stage(
                session.as_mut(),
                local,
                vec![expected.revision.clone(), local_revision],
            )?;
            if session.publish(Some(&expected), &revision)?.is_none() {
                return Err(DriverError::invalid_state("sync_conflict_expired"));
            }
            self.advance(revision, local.manifest.fingerprint.clone())?;
            Ok(report("uploaded"))
        } else {
            let incoming = Self::pull(session.as_mut(), remote_manifest)?;
            apply(&incoming, &local.manifest.fingerprint)?;
            self.advance(expected.revision, incoming.manifest.fingerprint.clone())?;
            Ok(report("downloaded"))
        }
    }
}
