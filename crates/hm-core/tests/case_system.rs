use hm_core::case_system::*;
use hm_core::*;
use uuid::Uuid;

fn case(store: &mut Store, title: &str) -> String {
    store
        .create_case(CreateCase {
            id: Uuid::new_v4().to_string(),
            title: title.into(),
            case_type: "other".into(),
            status_id: "in_progress".into(),
            tags: None,
        })
        .unwrap()
        .id
}
fn task(store: &Store, case_id: &str) -> ResourceRef {
    ResourceRef {
        kind: "task".into(),
        id: store
            .add_task(AddTask {
                case_id: case_id.into(),
                title: "Prepare materials".into(),
                due_date: None,
            })
            .unwrap(),
    }
}
fn meta(case_id: &str, resource: ResourceRef) -> ResourceMetadata {
    ResourceMetadata {
        case_id: case_id.into(),
        resource,
        importance: Importance::Important,
        tags: vec![" evidence ".into(), "Evidence".into(), "urgent".into()],
    }
}

#[test]
fn annotations_are_case_scoped_and_survive_restart_and_case_restore() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workspace.sqlite3");
    let mut store = Store::open(&path).unwrap();
    let id = case(&mut store, "One");
    let other = case(&mut store, "Other");
    let resource = task(&store, &id);
    store
        .save_resource_metadata(meta(&id, resource.clone()), &BuiltinResources)
        .unwrap();
    assert!(store
        .save_resource_metadata(meta(&other, resource.clone()), &BuiltinResources)
        .is_err());
    let mut bad = meta(&id, resource.clone());
    bad.tags = vec!["long".repeat(11)];
    assert!(store
        .save_resource_metadata(bad, &BuiltinResources)
        .is_err());
    store.trash_case(&id).unwrap();
    assert!(store
        .save_resource_metadata(meta(&id, resource), &BuiltinResources)
        .is_err());
    store.restore_case(&id).unwrap();
    drop(store);
    let store = Store::open(&path).unwrap();
    let values = store.workspace().unwrap().resource_metadata;
    assert_eq!(values.len(), 1);
    assert_eq!(values[0].importance, Importance::Important);
    assert_eq!(values[0].tags, vec!["evidence", "urgent"]);
}

#[test]
fn relations_reject_foreign_resources_and_cannot_rebind_an_id_to_another_case() {
    let mut s = Store::memory().unwrap();
    let one = case(&mut s, "One");
    let two = case(&mut s, "Two");
    let a = task(&s, &one);
    let b = task(&s, &one);
    let foreign = task(&s, &two);
    let mut r = ResourceRelation {
        id: Uuid::new_v4().to_string(),
        case_id: one.clone(),
        source: a.clone(),
        target: b,
        kind: "related".into(),
        label: "Supports".into(),
    };
    s.save_resource_relation(r.clone(), &BuiltinResources)
        .unwrap();
    s.save_resource_relation(r.clone(), &BuiltinResources)
        .unwrap();
    r.target = foreign.clone();
    assert!(s
        .save_resource_relation(r.clone(), &BuiltinResources)
        .is_err());
    r.case_id = two.clone();
    r.source = foreign;
    r.target = task(&s, &two);
    assert!(s.save_resource_relation(r, &BuiltinResources).is_err());
    s.delete_resource_relation(&two, &s.resource_relations().unwrap()[0].id)
        .unwrap();
    assert_eq!(s.resource_relations().unwrap().len(), 1);
    let mut self_link = s.resource_relations().unwrap().remove(0);
    self_link.target = a;
    assert!(s
        .save_resource_relation(self_link, &BuiltinResources)
        .is_err());
}

#[test]
fn migration_backs_up_v7_and_resource_deletion_cleans_references() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workspace.sqlite3");
    let mut s = Store::open(&path).unwrap();
    let id = case(&mut s, "Existing case");
    let resource = task(&s, &id);
    drop(s);
    let db = rusqlite::Connection::open(&path).unwrap();
    let triggers = db
        .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE '%_resource'")
        .unwrap()
        .query_map([], |r| r.get::<_, String>(0))
        .unwrap()
        .collect::<rusqlite::Result<Vec<_>>>()
        .unwrap();
    for name in triggers {
        db.execute_batch(&format!("DROP TRIGGER {name};")).unwrap();
    }
    db.execute_batch(
        "DROP TABLE resource_relations; DROP TABLE resource_metadata; PRAGMA user_version=7;",
    )
    .unwrap();
    drop(db);
    let s = Store::open(&path).unwrap();
    assert_eq!(s.workspace().unwrap().tasks[0].id, resource.id);
    let backup = std::fs::read_dir(root.path().join("migration-backups"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let old = rusqlite::Connection::open(backup).unwrap();
    assert_eq!(
        old.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        7
    );
    s.save_resource_metadata(meta(&id, resource.clone()), &BuiltinResources)
        .unwrap();
    let second = task(&s, &id);
    s.save_resource_relation(
        ResourceRelation {
            id: Uuid::new_v4().to_string(),
            case_id: id,
            source: resource.clone(),
            target: second,
            kind: "related".into(),
            label: "".into(),
        },
        &BuiltinResources,
    )
    .unwrap();
    // A legacy resource owner can delete its row without knowing about the new subsystem.
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute("DELETE FROM tasks WHERE id=?1", [resource.id])
        .unwrap();
    assert!(s.resource_metadata().unwrap().is_empty());
    assert!(s.resource_relations().unwrap().is_empty());
}

#[test]
fn a_trusted_module_can_extend_resolution_without_changing_annotation_storage() {
    struct Extension;
    impl ResourceProvider for Extension {
        fn kinds(&self) -> &[&str] {
            &["test.document"]
        }
    }
    impl ResourceResolver for Extension {
        fn validate(&self, store: &Store, case_id: &str, resource: &ResourceRef) -> Result<()> {
            if resource.kind == "test.document" && resource.id == "owned" {
                Ok(())
            } else {
                BuiltinResources.validate(store, case_id, resource)
            }
        }
    }
    let mut store = Store::memory().unwrap();
    let id = case(&mut store, "Extensible");
    let input = meta(
        &id,
        ResourceRef {
            kind: "test.document".into(),
            id: "owned".into(),
        },
    );
    assert!(store
        .save_resource_metadata(input.clone(), &BuiltinResources)
        .is_err());
    let mut registry = ResourceRegistry::default();
    registry.register(Box::new(Extension)).unwrap();
    assert!(registry.register(Box::new(Extension)).is_err());
    store.save_resource_metadata(input, &registry).unwrap();
    assert_eq!(
        store.resource_metadata().unwrap()[0].resource.kind,
        "test.document"
    );
}

#[test]
fn backup_restore_preserves_annotations_and_relations_without_duplicating_resources() {
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(&root.path().join("data/workspace.sqlite3")).unwrap();
    let id = case(&mut store, "Backup case");
    let a = task(&store, &id);
    let b = task(&store, &id);
    store
        .save_resource_metadata(meta(&id, a.clone()), &BuiltinResources)
        .unwrap();
    let relation = ResourceRelation {
        id: Uuid::new_v4().to_string(),
        case_id: id.clone(),
        source: a,
        target: b,
        kind: "related".into(),
        label: "Basis".into(),
    };
    store
        .save_resource_relation(relation.clone(), &BuiltinResources)
        .unwrap();
    let backup = store
        .create_backup(&root.path().join("backups"), true)
        .unwrap();
    store.delete_resource_relation(&id, &relation.id).unwrap();
    store
        .restore_backup(std::path::Path::new(&backup.directory), true)
        .unwrap();
    let workspace = store.workspace().unwrap();
    assert_eq!(workspace.resource_metadata.len(), 1);
    assert_eq!(workspace.resource_relations[0].id, relation.id);
    assert_eq!(workspace.tasks.len(), 2);
}

#[test]
fn changing_a_legacy_resources_case_detaches_only_the_old_case_annotations() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workspace.sqlite3");
    let mut store = Store::open(&path).unwrap();
    let one = case(&mut store, "One");
    let two = case(&mut store, "Two");
    let a = task(&store, &one);
    let b = task(&store, &one);
    store
        .save_resource_metadata(meta(&one, a.clone()), &BuiltinResources)
        .unwrap();
    store
        .save_resource_relation(
            ResourceRelation {
                id: Uuid::new_v4().to_string(),
                case_id: one,
                source: a.clone(),
                target: b,
                kind: "related".into(),
                label: "".into(),
            },
            &BuiltinResources,
        )
        .unwrap();
    let db = rusqlite::Connection::open(path).unwrap();
    db.execute(
        "UPDATE tasks SET case_id=?1 WHERE id=?2",
        rusqlite::params![two, a.id],
    )
    .unwrap();
    assert!(store.resource_metadata().unwrap().is_empty());
    assert!(store.resource_relations().unwrap().is_empty());
    assert!(store
        .save_resource_metadata(meta(&two, a), &BuiltinResources)
        .is_ok());
}
