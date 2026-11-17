//! Foreground orchestration. Cloud I/O never owns the business database lock.
use crate::{platforms::NativeDrivers, AppState};
use hm_application::{
    errors::core_error,
    identity::CloudWorkspace,
    sync::{IncomingVersion, SyncConflict, SyncEpoch, SyncReport, SyncService},
};
use hm_core::{StorageLocation, SyncSnapshot};
use hm_runtime::platform::{DriverError, DriverResult, ReplicaIdentity, SyncDriver, SyncSupport};
use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Preferences {
    format: u8,
    enabled: bool,
    reconcile: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            format: 1,
            enabled: false,
            reconcile: false,
        }
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    installed: bool,
    configured: bool,
    enabled: bool,
    phase: String,
    error_code: Option<String>,
    last_success_at: Option<String>,
    workspace_label: Option<String>,
    conflict: Option<SyncConflict>,
    incoming: Option<IncomingVersion>,
}
impl Default for SyncStatus {
    fn default() -> Self {
        Self {
            installed: false,
            configured: false,
            enabled: false,
            phase: "disabled".into(),
            error_code: None,
            last_success_at: None,
            workspace_label: None,
            conflict: None,
            incoming: None,
        }
    }
}
struct CachedSnapshot {
    generation: u64,
    captured: Instant,
    snapshot: SyncSnapshot,
}
#[derive(Default)]
struct Work {
    service: Option<SyncService>,
    identity: Option<ReplicaIdentity>,
    lease: u64,
    snapshot: Option<CachedSnapshot>,
}
pub struct SyncState {
    directory: PathBuf,
    driver: Arc<dyn SyncDriver>,
    epoch: SyncEpoch,
    foreground: AtomicBool,
    preferences: Mutex<Preferences>,
    status: Mutex<SyncStatus>,
    work: Mutex<Work>,
}
fn unavailable() -> DriverError {
    DriverError::invalid_state("sync_unavailable")
}
impl SyncState {
    fn status(&self) -> DriverResult<SyncStatus> {
        Ok(self.status.lock().map_err(|_| unavailable())?.clone())
    }
    fn preferences(&self) -> DriverResult<Preferences> {
        Ok(self.preferences.lock().map_err(|_| unavailable())?.clone())
    }
    fn change_preferences(&self, change: impl FnOnce(&mut Preferences)) -> DriverResult<()> {
        self.change_preferences_checked(None, change)
    }
    fn change_preferences_checked(
        &self,
        lease: Option<u64>,
        change: impl FnOnce(&mut Preferences),
    ) -> DriverResult<()> {
        let mut current = self.preferences.lock().map_err(|_| unavailable())?;
        if let Some(lease) = lease {
            self.check(lease)?;
        }
        let mut next = current.clone();
        change(&mut next);
        std::fs::create_dir_all(&self.directory)?;
        let mut file = tempfile::NamedTempFile::new_in(&self.directory)?;
        file.write_all(&serde_json::to_vec(&next).map_err(|_| unavailable())?)?;
        file.as_file().sync_all()?;
        file.persist(self.directory.join("sync-preferences.json"))
            .map_err(|e| DriverError::from(e.error))?;
        *current = next;
        Ok(())
    }
    fn check(&self, lease: u64) -> DriverResult<()> {
        self.epoch.check(lease)?;
        if !self.foreground.load(Ordering::Acquire) {
            return Err(DriverError::invalid_state("sync_interrupted"));
        }
        Ok(())
    }
    fn support(&self) -> DriverResult<SyncSupport> {
        let support = self.driver.support()?;
        let mut status = self.status.lock().map_err(|_| unavailable())?;
        status.installed = support.installed;
        status.configured = support.configured;
        Ok(support)
    }
    fn remember_report(
        &self,
        lease: u64,
        report: SyncReport,
        current: bool,
    ) -> DriverResult<SyncStatus> {
        let mut status = self.status.lock().map_err(|_| unavailable())?;
        self.check(lease)?;
        status.phase = match report.phase {
            "current" | "uploaded" | "downloaded" if current => "synced",
            "current" | "uploaded" | "downloaded" | "retry" => "pending",
            phase => phase,
        }
        .into();
        if status.phase == "synced" {
            status.last_success_at = Some(chrono::Utc::now().to_rfc3339());
        }
        status.conflict = report.conflict;
        status.incoming = report.incoming;
        status.error_code = None;
        Ok(status.clone())
    }
}
pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let directory = app
        .state::<StorageLocation>()
        .data_directory
        .join("sync-private");
    let path = directory.join("sync-preferences.json");
    // Damaged optional cloud configuration must never prevent offline launch.
    let loaded = (|| -> DriverResult<Preferences> {
        if !path.exists() {
            return Ok(Preferences::default());
        }
        if std::fs::metadata(&path)?.len() > 4096 {
            return Err(unavailable());
        }
        let value: Preferences =
            serde_json::from_slice(&std::fs::read(path)?).map_err(|_| unavailable())?;
        if value.format != 1 {
            return Err(unavailable());
        }
        Ok(value)
    })();
    let damaged = loaded.is_err();
    let preferences = loaded.unwrap_or_default();
    let status = SyncStatus {
        error_code: damaged.then(|| "sync_configuration_invalid".into()),
        enabled: preferences.enabled,
        phase: if preferences.enabled {
            "pending"
        } else {
            "disabled"
        }
        .into(),
        ..Default::default()
    };
    app.manage(SyncState {
        directory,
        driver: app.state::<NativeDrivers>().sync.clone(),
        epoch: SyncEpoch::default(),
        foreground: AtomicBool::new(true),
        preferences: Mutex::new(preferences),
        status: Mutex::new(status),
        work: Mutex::new(Work::default()),
    });
    Ok(())
}
/// Logout/restore/background invalidates existing transport leases immediately.
pub(crate) fn pause(app: &AppHandle, reconcile: bool) -> DriverResult<()> {
    let state = app.state::<SyncState>();
    state.epoch.invalidate();
    let persisted = state.change_preferences(|p| {
        p.enabled = false;
        p.reconcile |= reconcile;
    });
    let mut status = state.status.lock().map_err(|_| unavailable())?;
    status.enabled = false;
    status.phase = "disabled".into();
    status.incoming = None;
    status.conflict = None;
    persisted
}
fn context(
    app: &AppHandle,
    state: &SyncState,
    workspace: Option<&str>,
) -> DriverResult<(ReplicaIdentity, String)> {
    let storage = state.driver.storage_account()?;
    super::identity::verified(app, |service| {
        let user = service.verified_user_id()?;
        // Never bind a previous user's local dataset to a newly signed-in user.
        let stored = SyncService::stored_identity(&state.directory)?;
        if stored
            .as_ref()
            .is_some_and(|old| old.user_id != user || old.storage != storage)
        {
            return Err(DriverError::invalid_state("sync_account_changed"));
        }
        let catalog = service.cloud_workspaces(&storage)?;
        let selected = workspace.or_else(|| stored.as_ref().map(|old| old.workspace_id.as_str()));
        let chosen = match selected {
            Some(id) => catalog
                .workspaces
                .iter()
                .find(|w| w.id == id)
                .ok_or_else(|| DriverError::invalid_state("sync_scope_mismatch"))?,
            None if catalog.workspaces.len() == 1 => &catalog.workspaces[0],
            None => {
                return Err(DriverError::invalid_state(
                    "sync_workspace_selection_required",
                ))
            }
        };
        Ok((
            ReplicaIdentity {
                user_id: catalog.user_id,
                workspace_id: chosen.id.clone(),
                storage,
            },
            chosen.label.clone(),
        ))
    })
}
fn verify_current(
    app: &AppHandle,
    state: &SyncState,
    identity: &ReplicaIdentity,
) -> DriverResult<()> {
    let user = super::identity::verified(app, |s| s.verified_user_id())?;
    if user != identity.user_id || state.driver.storage_account()? != identity.storage {
        return Err(DriverError::invalid_state("sync_account_changed"));
    }
    Ok(())
}
fn snapshot(app: &AppHandle, work: &mut Work) -> DriverResult<()> {
    let state = app.state::<AppState>();
    let prepared = {
        let store = state.0.lock().map_err(|_| unavailable())?;
        if work.snapshot.as_ref().is_some_and(|s| {
            s.generation == store.sync_generation()
                && s.captured.elapsed() < Duration::from_secs(60)
        }) {
            return Ok(());
        }
        store.prepare_sync_snapshot().map_err(core_error)?
    };
    let generation = prepared.generation;
    let snapshot = prepared.finish().map_err(core_error)?;
    if state.0.lock().map_err(|_| unavailable())?.sync_generation() != generation {
        return Err(DriverError::invalid_state("sync_local_changed"));
    }
    work.snapshot = Some(CachedSnapshot {
        generation,
        captured: Instant::now(),
        snapshot,
    });
    Ok(())
}
fn apply(
    app: &AppHandle,
    state: &SyncState,
    lease: u64,
    snapshot: &SyncSnapshot,
    expected: &str,
) -> DriverResult<()> {
    state.check(lease)?;
    // Same ordering as restore: recording -> transcription -> business store.
    let recording = app.state::<super::recording::RecordingState>();
    let capture = recording
        .0
        .try_lock()
        .map_err(|_| DriverError::invalid_state("sync_workspace_busy"))?;
    let speech = app.state::<super::speech::SpeechState>();
    let transcription = speech
        .0
        .try_lock()
        .map_err(|_| DriverError::invalid_state("sync_workspace_busy"))?;
    if capture.state().is_some() || transcription.has_pending() {
        return Err(DriverError::invalid_state("sync_workspace_busy"));
    }
    let business = app.state::<AppState>();
    let mut store = business.0.lock().map_err(|_| unavailable())?;
    state.check(lease)?;
    snapshot.apply(&mut store, expected).map_err(core_error)?;
    Ok(())
}
fn perform(app: &AppHandle, state: &SyncState, action: Action) -> DriverResult<SyncStatus> {
    let mut work = match state.work.try_lock() {
        Ok(work) => work,
        Err(_) if matches!(action, Action::Tick) => return state.status(),
        Err(_) => return Err(DriverError::invalid_state("sync_busy")),
    };
    let lease = state.epoch.current();
    state.check(lease)?;
    let enabling = matches!(action, Action::Enable(_));
    if !enabling && !state.preferences()?.enabled {
        return state.status();
    }
    let support = state.support()?;
    if !support.configured {
        return Err(DriverError::invalid_state("cloud_not_configured"));
    }
    if enabling || work.service.is_none() || work.lease != lease {
        let selected = match &action {
            Action::Enable(id) => id.as_deref(),
            _ => None,
        };
        let (identity, label) = context(app, state, selected)?;
        state.check(lease)?;
        let mut service = SyncService::open(
            state.epoch.guard(state.driver.clone()),
            &state.directory,
            identity.clone(),
        )?;
        service.enable()?;
        state.check(lease)?;
        if state.preferences()?.reconcile {
            service.require_reconciliation()?;
        }
        // Configuration and its lease are committed together. pause() invalidates
        // the epoch before waiting for this preferences mutex.
        state.change_preferences_checked(Some(lease), |p| {
            p.enabled = true;
            p.reconcile = false;
        })?;
        state.check(lease)?;
        work.service = Some(service);
        work.identity = Some(identity);
        work.lease = lease;
        work.snapshot = None;
        let mut status = state.status.lock().map_err(|_| unavailable())?;
        state.check(lease)?;
        status.enabled = true;
        status.workspace_label = Some(label);
        status.phase = "pending".into();
        status.error_code = None;
        if enabling {
            return Ok(status.clone());
        }
    }
    verify_current(app, state, work.identity.as_ref().ok_or_else(unavailable)?)?;
    state.check(lease)?;
    if matches!(action, Action::Tick) && state.status()?.conflict.is_some() {
        return state.status();
    }
    state.status.lock().map_err(|_| unavailable())?.phase = "syncing".into();
    let report = match action {
        Action::Apply(token) => {
            let report = work
                .service
                .as_mut()
                .ok_or_else(unavailable)?
                .apply_prepared(&token, |snapshot, expected| {
                    apply(app, state, lease, snapshot, expected)
                })?;
            work.snapshot = None;
            report
        }
        Action::Resolve(token, use_local) => {
            snapshot(app, &mut work)?;
            let Work {
                service, snapshot, ..
            } = &mut *work;
            let report = service.as_mut().ok_or_else(unavailable)?.resolve(
                &token,
                use_local,
                &snapshot.as_ref().ok_or_else(unavailable)?.snapshot,
                |snapshot, expected| apply(app, state, lease, snapshot, expected),
            )?;
            if !use_local {
                work.snapshot = None;
            }
            report
        }
        _ => {
            snapshot(app, &mut work)?;
            let Work {
                service, snapshot, ..
            } = &mut *work;
            service
                .as_mut()
                .ok_or_else(unavailable)?
                .prepare_synchronize(&snapshot.as_ref().ok_or_else(unavailable)?.snapshot)?
        }
    };
    state.check(lease)?;
    let current = work.snapshot.as_ref().is_none_or(|cache| {
        app.state::<AppState>()
            .0
            .lock()
            .map(|s| s.sync_generation() == cache.generation)
            .unwrap_or(false)
    });
    state.remember_report(lease, report, current)
}
enum Action {
    Enable(Option<String>),
    Tick,
    Apply(String),
    Resolve(String, bool),
}
async fn run(app: AppHandle, action: Action) -> DriverResult<SyncStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<SyncState>();
        let lease = state.epoch.current();
        match perform(&app, &state, action) {
            Ok(status) => Ok(status),
            Err(error) => {
                if state.epoch.current() == lease {
                    let mut status = state.status.lock().map_err(|_| unavailable())?;
                    state.epoch.check(lease)?;
                    if ["sync_local_changed", "sync_incoming_expired"]
                        .contains(&error.code.as_str())
                    {
                        status.incoming = None;
                    }
                    if error.code == "sync_conflict_expired" {
                        status.conflict = None;
                    }
                    status.phase = if error.code == "sync_local_changed" {
                        "pending"
                    } else {
                        "error"
                    }
                    .into();
                    status.error_code = Some(error.code.clone());
                }
                Err(error)
            }
        }
    })
    .await
    .map_err(|_| unavailable())?
}
#[tauri::command]
pub fn native_sync_provider(platform: State<'_, NativeDrivers>) -> Option<String> {
    platform.sync.provider().map(str::to_owned)
}
#[tauri::command]
pub async fn sync_status(app: AppHandle) -> DriverResult<SyncStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<SyncState>();
        state.support()?;
        state.status()
    })
    .await
    .map_err(|_| unavailable())?
}
#[tauri::command]
pub async fn sync_workspaces(app: AppHandle) -> DriverResult<Vec<CloudWorkspace>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<SyncState>();
        if !state.support()?.configured {
            return Err(DriverError::invalid_state("cloud_not_configured"));
        }
        let storage = state.driver.storage_account()?;
        super::identity::verified(&app, |service| {
            let user = service.verified_user_id()?;
            if SyncService::stored_identity(&state.directory)?
                .is_some_and(|old| old.user_id != user || old.storage != storage)
            {
                return Err(DriverError::invalid_state("sync_account_changed"));
            }
            Ok(service.cloud_workspaces(&storage)?.workspaces)
        })
    })
    .await
    .map_err(|_| unavailable())?
}
#[tauri::command]
pub async fn sync_enable(app: AppHandle, workspace_id: Option<String>) -> DriverResult<SyncStatus> {
    run(app, Action::Enable(workspace_id)).await
}
#[tauri::command]
pub fn sync_disable(app: AppHandle) -> DriverResult<SyncStatus> {
    pause(&app, false)?;
    app.state::<SyncState>().status()
}
#[tauri::command]
pub fn sync_presence(app: AppHandle, foreground: bool) {
    let state = app.state::<SyncState>();
    if state.foreground.swap(foreground, Ordering::AcqRel) && !foreground {
        state.epoch.invalidate();
    }
}
#[tauri::command]
pub async fn sync_tick(app: AppHandle) -> DriverResult<SyncStatus> {
    run(app, Action::Tick).await
}
#[tauri::command]
pub async fn sync_apply_pending(app: AppHandle, token: String) -> DriverResult<SyncStatus> {
    run(app, Action::Apply(token)).await
}
#[tauri::command]
pub async fn sync_resolve(
    app: AppHandle,
    token: String,
    use_local: bool,
) -> DriverResult<SyncStatus> {
    run(app, Action::Resolve(token, use_local)).await
}
