use hm_application::sync::{SyncReport, SyncService};
use hm_core::{CreateCase, MaterialTarget, Store};
use hm_runtime::platform::{
    CloudIdentity, DriverError, DriverResult, ReplicaIdentity, SyncDriver, SyncHead, SyncSession,
};
use std::{
    collections::BTreeMap,
    io::{Cursor, Read},
    path::Path,
    sync::{Arc, Mutex},
};

struct Cloud {
    account: ReplicaIdentity,
    blobs: BTreeMap<String, Vec<u8>>,
    head: Option<SyncHead>,
    version: u64,
    race: bool,
    offline: bool,
    puts: usize,
}
impl Default for Cloud {
    fn default() -> Self {
        Self {
            account: ReplicaIdentity {
                user_id: "00000000-0000-0000-0000-000000000001".into(),
                workspace_id: "00000000-0000-0000-0000-000000000002".into(),
                storage: CloudIdentity {
                    provider: "test-cloud".into(),
                    subject: "opaque-user-1".into(),
                },
            },
            blobs: BTreeMap::new(),
            head: None,
            version: 0,
            race: false,
            offline: false,
            puts: 0,
        }
    }
}
#[derive(Clone)]
struct MemoryCloud(Arc<Mutex<Cloud>>);
struct Session {
    cloud: MemoryCloud,
    account: ReplicaIdentity,
}
impl SyncDriver for MemoryCloud {
    fn open(&self, _: &ReplicaIdentity) -> DriverResult<Box<dyn SyncSession>> {
        let cloud = self.0.lock().unwrap();
        if cloud.offline {
            return Err(DriverError::invalid_state("sync_offline"));
        }
        Ok(Box::new(Session {
            cloud: self.clone(),
            account: cloud.account.clone(),
        }))
    }
}
impl Session {
    fn access<T>(&self, action: impl FnOnce(&mut Cloud) -> DriverResult<T>) -> DriverResult<T> {
        let mut cloud = self.cloud.0.lock().unwrap();
        if cloud.offline {
            return Err(DriverError::invalid_state("sync_offline"));
        }
        if cloud.account != self.account {
            return Err(DriverError::invalid_state("sync_account_changed"));
        }
        action(&mut cloud)
    }
}
impl SyncSession for Session {
    fn identity(&self) -> &ReplicaIdentity {
        &self.account
    }
    fn head(&mut self) -> DriverResult<Option<SyncHead>> {
        self.access(|c| Ok(c.head.clone()))
    }
    fn has_blob(&mut self, digest: &str) -> DriverResult<bool> {
        self.access(|c| Ok(c.blobs.contains_key(digest)))
    }
    fn put_blob(&mut self, digest: &str, source: &mut dyn Read) -> DriverResult<u64> {
        let mut bytes = vec![];
        source.read_to_end(&mut bytes)?;
        self.access(|c| {
            if let Some(existing) = c.blobs.get(digest) {
                assert_eq!(existing, &bytes);
            } else {
                c.blobs.insert(digest.into(), bytes.clone());
                c.puts += 1;
            }
            Ok(bytes.len() as u64)
        })
    }
    fn get_blob(&mut self, digest: &str) -> DriverResult<Box<dyn Read>> {
        self.access(|c| {
            Ok(Box::new(Cursor::new(
                c.blobs
                    .get(digest)
                    .ok_or_else(|| DriverError::invalid_state("sync_blob_missing"))?
                    .clone(),
            )) as Box<dyn Read>)
        })
    }
    fn publish(
        &mut self,
        expected: Option<&SyncHead>,
        revision: &str,
    ) -> DriverResult<Option<SyncHead>> {
        self.access(|c| {
            if std::mem::take(&mut c.race) || c.head.as_ref() != expected {
                return Ok(None);
            }
            c.version += 1;
            let head = SyncHead {
                revision: revision.into(),
                version: c.version.to_string(),
            };
            c.head = Some(head.clone());
            Ok(Some(head))
        })
    }
}
fn service(cloud: &MemoryCloud, path: &Path) -> SyncService {
    let mut service = SyncService::open(
        Box::new(cloud.clone()),
        path,
        cloud.0.lock().unwrap().account.clone(),
    )
    .unwrap();
    service.enable().unwrap();
    service
}
fn store(path: &Path) -> Store {
    Store::open(&path.join("workspace.sqlite3")).unwrap()
}
fn create(store: &mut Store, title: &str) -> String {
    store
        .create_case(CreateCase {
            id: uuid::Uuid::new_v4().to_string(),
            title: title.into(),
            case_type: "civil".into(),
            status_id: "not_started".into(),
            tags: None,
        })
        .unwrap()
        .id
}
fn sync(service: &mut SyncService, store: &mut Store) -> DriverResult<SyncReport> {
    let snapshot = store.create_sync_snapshot().unwrap();
    service.synchronize(&snapshot, |incoming, expected| {
        incoming
            .apply(store, expected)
            .map(|_| ())
            .map_err(hm_application::errors::core_error)
    })
}

#[test]
fn two_devices_resume_the_same_workspace_and_reuse_audio_blobs_with_persisted_baselines() {
    let cloud = MemoryCloud(Arc::new(Mutex::new(Cloud::default())));
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    let mut first = store(a.path());
    let case = create(&mut first, "真实 SQLite，虚构案件");
    let recording = first
        .save_recording(
            MaterialTarget {
                case_id: case.clone(),
                proceeding_id: None,
                parent_id: None,
                record_id: None,
                stage_id: None,
            },
            "语音.m4a",
            b"fictional immutable audio",
        )
        .unwrap();
    let mut second = store(b.path());
    second.set_setting("theme", "light").unwrap();
    let mut first_sync = service(&cloud, &a.path().join("identity"));
    let mut second_sync = service(&cloud, &b.path().join("identity"));
    assert_eq!(sync(&mut first_sync, &mut first).unwrap().phase, "uploaded");
    assert_eq!(
        sync(&mut second_sync, &mut second).unwrap().phase,
        "downloaded"
    );
    assert_eq!(second.workspace().unwrap().cases[0].id, case);
    assert_eq!(
        std::fs::read(second.material_path(&recording).unwrap()).unwrap(),
        b"fictional immutable audio"
    );
    assert_eq!(second.setting("theme").unwrap().as_deref(), Some("light"));
    let puts = cloud.0.lock().unwrap().puts;
    assert_eq!(sync(&mut first_sync, &mut first).unwrap().phase, "current");
    assert_eq!(
        sync(&mut second_sync, &mut second).unwrap().phase,
        "current"
    );
    assert_eq!(cloud.0.lock().unwrap().puts, puts);
    first.set_case_status(&case, "in_progress").unwrap();
    assert_eq!(sync(&mut first_sync, &mut first).unwrap().phase, "uploaded");
    // Only a new database, manifest and revision are transmitted. Audio is reused.
    assert_eq!(cloud.0.lock().unwrap().puts, puts + 3);
    assert_eq!(
        sync(&mut second_sync, &mut second).unwrap().phase,
        "downloaded"
    );
    assert_eq!(
        second.workspace().unwrap().cases[0].status_id,
        "in_progress"
    );
    drop(second_sync);
    let mut reopened = SyncService::open(
        Box::new(cloud.clone()),
        &b.path().join("identity"),
        cloud.0.lock().unwrap().account.clone(),
    )
    .unwrap();
    assert!(reopened.enabled());
    assert_eq!(sync(&mut reopened, &mut second).unwrap().phase, "current");
}

#[test]
fn concurrent_edits_pause_and_resolution_preserves_both_versions_and_rejects_stale_choices() {
    let cloud = MemoryCloud(Arc::new(Mutex::new(Cloud::default())));
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    let mut first = store(a.path());
    let case = create(&mut first, "Conflict fixture");
    let mut second = store(b.path());
    let mut first_sync = service(&cloud, &a.path().join("identity"));
    let mut second_sync = service(&cloud, &b.path().join("identity"));
    sync(&mut first_sync, &mut first).unwrap();
    sync(&mut second_sync, &mut second).unwrap();
    first.set_case_status(&case, "in_progress").unwrap();
    sync(&mut first_sync, &mut first).unwrap();
    second.add_record(&case, "离线修改应当保留").unwrap();
    let head = cloud.0.lock().unwrap().head.clone();
    let conflict = sync(&mut second_sync, &mut second)
        .unwrap()
        .conflict
        .unwrap();
    assert_eq!(cloud.0.lock().unwrap().head, head);
    assert_eq!(
        second.workspace().unwrap().work_records[0].body,
        "离线修改应当保留"
    );
    let snapshot = second.create_sync_snapshot().unwrap();
    assert!(second_sync
        .resolve("wrong", false, &snapshot, |_, _| panic!(
            "invalid token cannot apply"
        ))
        .is_err());
    first.add_record(&case, "另一设备又修改了").unwrap();
    sync(&mut first_sync, &mut first).unwrap();
    assert_eq!(
        second_sync
            .resolve(&conflict.token, false, &snapshot, |_, _| panic!(
                "stale cloud version cannot apply"
            ))
            .unwrap_err()
            .code,
        "sync_conflict_expired"
    );
    let conflict = sync(&mut second_sync, &mut second)
        .unwrap()
        .conflict
        .unwrap();
    let result = second_sync
        .resolve(&conflict.token, false, &snapshot, |incoming, expected| {
            incoming
                .apply(&mut second, expected)
                .map(|_| ())
                .map_err(hm_application::errors::core_error)
        })
        .unwrap();
    assert_eq!(result.phase, "downloaded");
    assert_eq!(second_sync.preserved_versions().len(), 2);
    for version in second_sync.preserved_versions() {
        assert!(cloud
            .0
            .lock()
            .unwrap()
            .blobs
            .contains_key(&version.revision));
    }
    let preserved = second_sync
        .preserved_snapshot(&second_sync.preserved_versions()[0].revision)
        .unwrap();
    let recovery = tempfile::tempdir().unwrap();
    let mut restored = store(recovery.path());
    let expected = restored.sync_fingerprint().unwrap();
    preserved.apply(&mut restored, &expected).unwrap();
    assert_eq!(
        restored.workspace().unwrap().work_records[0].body,
        "离线修改应当保留"
    );
    assert_eq!(
        second.workspace().unwrap().work_records[0].body,
        "另一设备又修改了"
    );
    assert_eq!(
        sync(&mut second_sync, &mut second).unwrap().phase,
        "current"
    );
}

#[test]
fn offline_failures_account_changes_and_head_races_do_not_drop_local_changes_or_cross_accounts() {
    let cloud = MemoryCloud(Arc::new(Mutex::new(Cloud::default())));
    let root = tempfile::tempdir().unwrap();
    let mut store = store(root.path());
    create(&mut store, "Keep local");
    let mut service = service(&cloud, &root.path().join("identity"));
    cloud.0.lock().unwrap().offline = true;
    assert_eq!(
        sync(&mut service, &mut store).unwrap_err().code,
        "sync_offline"
    );
    assert_eq!(store.workspace().unwrap().cases.len(), 1);
    cloud.0.lock().unwrap().offline = false;
    cloud.0.lock().unwrap().race = true;
    assert_eq!(sync(&mut service, &mut store).unwrap().phase, "retry");
    assert!(cloud.0.lock().unwrap().head.is_none());
    assert_eq!(sync(&mut service, &mut store).unwrap().phase, "uploaded");
    let puts = cloud.0.lock().unwrap().puts;
    cloud.0.lock().unwrap().account.storage.subject = "different-user".into();
    assert_eq!(
        sync(&mut service, &mut store).unwrap_err().code,
        "sync_account_changed"
    );
    assert_eq!(service.enable().unwrap_err().code, "sync_account_changed");
    assert_eq!(cloud.0.lock().unwrap().puts, puts);
    cloud.0.lock().unwrap().account.storage.subject = "opaque-user-1".into();
    cloud.0.lock().unwrap().account.user_id = "00000000-0000-0000-0000-000000000003".into();
    assert_eq!(
        sync(&mut service, &mut store).unwrap_err().code,
        "sync_account_changed"
    );
    assert_eq!(cloud.0.lock().unwrap().puts, puts);
    service.disable().unwrap();
    assert_eq!(sync(&mut service, &mut store).unwrap().phase, "disabled");
    assert_eq!(store.workspace().unwrap().cases.len(), 1);
}

#[test]
fn incoming_data_cannot_overwrite_a_local_edit_made_during_network_work() {
    let cloud = MemoryCloud(Arc::new(Mutex::new(Cloud::default())));
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    let mut first = store(a.path());
    create(&mut first, "Remote");
    let mut second = store(b.path());
    let mut first_sync = service(&cloud, &a.path().join("identity"));
    let mut second_sync = service(&cloud, &b.path().join("identity"));
    sync(&mut first_sync, &mut first).unwrap();
    let snapshot = second.create_sync_snapshot().unwrap();
    let result = second_sync.synchronize(&snapshot, |incoming, expected| {
        create(&mut second, "本机新增，不能覆盖");
        incoming
            .apply(&mut second, expected)
            .map(|_| ())
            .map_err(hm_application::errors::core_error)
    });
    assert!(result.is_err());
    assert_eq!(
        second.workspace().unwrap().cases[0].title,
        "本机新增，不能覆盖"
    );
    assert_eq!(
        sync(&mut second_sync, &mut second).unwrap().phase,
        "conflict"
    );
}

#[test]
fn a_missing_remote_head_is_not_silently_recreated_after_previously_syncing() {
    let cloud = MemoryCloud(Arc::new(Mutex::new(Cloud::default())));
    let root = tempfile::tempdir().unwrap();
    let mut store = store(root.path());
    create(&mut store, "Remote reset");
    let mut service = service(&cloud, &root.path().join("identity"));
    sync(&mut service, &mut store).unwrap();
    cloud.0.lock().unwrap().head = None;
    assert_eq!(
        sync(&mut service, &mut store).unwrap_err().code,
        "sync_remote_reset"
    );
    assert!(cloud.0.lock().unwrap().head.is_none());
}
