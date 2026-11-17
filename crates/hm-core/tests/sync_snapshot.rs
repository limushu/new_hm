use hm_core::{CreateCase, MaterialTarget, Store, SyncSnapshot, SyncSnapshotManifest};
use std::io::Read;
#[test]
fn fingerprints_ignore_device_settings_and_page_layout_but_detect_external_file_edits_and_deletion()
{
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(&root.path().join("workspace.sqlite3")).unwrap();
    assert!(store.create_sync_snapshot().unwrap().pristine);
    let case = store
        .create_case(CreateCase {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Snapshot fixture".into(),
            case_type: "civil".into(),
            status_id: "not_started".into(),
            tags: None,
        })
        .unwrap();
    let id = store
        .save_recording(
            MaterialTarget {
                case_id: case.id.clone(),
                proceeding_id: None,
                parent_id: None,
                record_id: None,
                stage_id: None,
            },
            "语音.m4a",
            b"fictional source",
        )
        .unwrap();
    let original = store.create_sync_snapshot().unwrap();
    assert!(!original.pristine);
    store.set_setting("theme", "light").unwrap();
    store
        .set_setting("backup_directory", "/other/device")
        .unwrap();
    assert_eq!(
        store.sync_fingerprint().unwrap(),
        original.manifest.fingerprint
    );
    std::fs::write(
        store.material_path(&id).unwrap(),
        b"fictional externally edited source",
    )
    .unwrap();
    assert_ne!(
        store.sync_fingerprint().unwrap(),
        original.manifest.fingerprint
    );
    store.trash_case(&case.id).unwrap();
    let trashed = store.create_sync_snapshot().unwrap();
    assert_eq!(
        store.sync_fingerprint().unwrap(),
        trashed.manifest.fingerprint
    );
    let bytes = trashed.manifest.bytes().unwrap();
    let manifest = SyncSnapshotManifest::parse(&bytes).unwrap();
    let mut blobs = std::collections::BTreeMap::new();
    for (name, digest) in manifest.files() {
        let mut bytes = vec![];
        trashed.file(name).unwrap().read_to_end(&mut bytes).unwrap();
        blobs.insert(digest.clone(), bytes);
    }
    let received = SyncSnapshot::from_remote(manifest, |digest| {
        Ok(Box::new(std::io::Cursor::new(blobs[digest].clone())))
    })
    .unwrap();
    assert_eq!(received.manifest.fingerprint, trashed.manifest.fingerprint);
    assert!(
        SyncSnapshot::from_remote(SyncSnapshotManifest::parse(&bytes).unwrap(), |_| Ok(
            Box::new(std::io::Cursor::new(b"corrupt"))
        ))
        .is_err()
    );
}

#[test]
fn preparation_can_finish_without_the_store_and_generation_detects_edits_during_file_copy() {
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(&root.path().join("workspace.sqlite3")).unwrap();
    let case = store
        .create_case(CreateCase {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Snapshot capture".into(),
            case_type: "civil".into(),
            status_id: "not_started".into(),
            tags: None,
        })
        .unwrap();
    let prepared = store.prepare_sync_snapshot().unwrap();
    let generation = prepared.generation;
    store.set_case_status(&case.id, "in_progress").unwrap();
    // The owned SQLite copy finishes outside the original database lock.
    let snapshot = prepared.finish().unwrap();
    assert_ne!(generation, store.sync_generation());
    assert_ne!(
        snapshot.manifest.fingerprint,
        store.sync_fingerprint().unwrap()
    );
    let prepared = store.prepare_sync_snapshot().unwrap();
    drop(store);
    assert!(!prepared.finish().unwrap().pristine);
}
