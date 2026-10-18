use hm_core::*;
use uuid::Uuid;
fn person(name: &str, kind: &str) -> Contact {
    Contact {
        id: Uuid::new_v4().to_string(),
        name: name.into(),
        kind: kind.into(),
        phone: String::new(),
        address: String::new(),
        notes: String::new(),
    }
}
fn case(s: &mut Store) -> Case {
    let mut item = s
        .create_case(CreateCase {
            tags: None,
            id: Uuid::new_v4().to_string(),
            title: "关系验收（虚构）".into(),
            case_type: "civil".into(),
            status_id: "in_progress".into(),
        })
        .unwrap();
    item.current_proceeding_id = Some(s.add_proceeding(&item.id, "first_instance").unwrap());
    item
}
#[test]
fn program_selection_reuses_objects_and_keeps_proceedings_and_history_separate() {
    let mut s = Store::memory().unwrap();
    let a = case(&mut s);
    let b = case(&mut s);
    let court = person("示例甲法院", "court");
    let other = person("示例乙法院", "court");
    let judge = person("示例法官", "judge");
    s.save_contact(court.clone()).unwrap();
    s.save_contact(other.clone()).unwrap();
    s.save_contact_with_courts(judge.clone(), Some(vec![court.id.clone()]))
        .unwrap();
    let p = a.current_proceeding_id.unwrap();
    let input = ProceedingContacts {
        proceeding_id: p.clone(),
        court_id: Some(court.id.clone()),
        judge_id: Some(judge.id.clone()),
    };
    s.set_proceeding_contacts(input.clone()).unwrap();
    s.set_proceeding_contacts(input.clone()).unwrap();
    assert_eq!(s.contact_links().unwrap().len(), 2);
    assert_eq!(s.contacts().unwrap().len(), 3);
    let q = s.add_proceeding(&a.id, "appeal").unwrap();
    s.set_proceeding_contacts(ProceedingContacts {
        proceeding_id: q.clone(),
        court_id: Some(other.id.clone()),
        judge_id: None,
    })
    .unwrap();
    s.set_proceeding_contacts(ProceedingContacts {
        proceeding_id: b.current_proceeding_id.unwrap(),
        ..input.clone()
    })
    .unwrap();
    assert!(s
        .set_proceeding_contacts(ProceedingContacts {
            court_id: Some(other.id.clone()),
            ..input.clone()
        })
        .is_err());
    assert_eq!(s.contact_links().unwrap().len(), 5);
    let renamed = Contact {
        name: "示例甲法院新名称".into(),
        ..court.clone()
    };
    s.save_contact_with_courts(renamed, None).unwrap();
    let data = s.workspace().unwrap();
    assert_eq!(
        data.proceedings.iter().find(|x| x.id == p).unwrap().court,
        "示例甲法院新名称"
    );
    assert_eq!(
        data.proceedings.iter().find(|x| x.id == q).unwrap().court,
        "示例乙法院"
    );
    s.save_contact_with_courts(judge.clone(), Some(vec![other.id.clone()]))
        .unwrap();
    assert_eq!(
        s.workspace()
            .unwrap()
            .proceedings
            .iter()
            .find(|x| x.id == p)
            .unwrap()
            .judge,
        judge.name
    ); // editing affiliation does not rewrite an old program
    s.trash_case(&a.id).unwrap();
    assert!(s.set_proceeding_contacts(input).is_err());
}
#[test]
fn invalid_affiliation_rolls_back_contact_and_relation_changes() {
    let s = Store::memory().unwrap();
    let court = person("某法院", "court");
    let judge = person("法官甲", "judge");
    let ordinary = person("联系人", "person");
    s.save_contact(court.clone()).unwrap();
    s.save_contact(ordinary.clone()).unwrap();
    s.save_contact_with_courts(judge.clone(), Some(vec![court.id.clone()]))
        .unwrap();
    assert!(s
        .save_contact_with_courts(
            Contact {
                name: "不应保存".into(),
                ..judge.clone()
            },
            Some(vec![ordinary.id])
        )
        .is_err());
    assert_eq!(
        s.contacts()
            .unwrap()
            .iter()
            .find(|c| c.id == judge.id)
            .unwrap()
            .name,
        "法官甲"
    );
    assert_eq!(s.contact_relations().unwrap().len(), 1);
    assert!(s
        .save_contact(Contact {
            kind: "organization".into(),
            ..court.clone()
        })
        .is_err());
    s.save_contact_with_courts(judge, Some(vec![])).unwrap();
    s.delete_contact(&court.id).unwrap();
}
#[test]
fn deleting_linked_objects_detaches_every_relation_but_preserves_case_history() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workspace.sqlite3");
    let mut s = Store::open(&path).unwrap();
    let a = case(&mut s);
    let b = case(&mut s);
    let court = person("保留在案件中的法院名称", "court");
    let judge = person("保留在案件中的法官名称", "judge");
    let client = person("可删除的关联联系人", "person");
    for c in [&court, &judge, &client] {
        s.save_contact(c.clone()).unwrap();
    }
    for c in [&a, &b] {
        s.set_proceeding_contacts(ProceedingContacts {
            proceeding_id: c.current_proceeding_id.clone().unwrap(),
            court_id: Some(court.id.clone()),
            judge_id: Some(judge.id.clone()),
        })
        .unwrap();
        s.save_contact_link(ContactLink {
            id: Uuid::new_v4().to_string(),
            contact_id: client.id.clone(),
            case_id: c.id.clone(),
            proceeding_id: None,
            role: "当事人".into(),
        })
        .unwrap();
    }
    s.trash_case(&b.id).unwrap();
    s.delete_contact(&court.id).unwrap();
    assert!(s.contact_relations().unwrap().is_empty());
    assert_eq!(s.contact_links().unwrap().len(), 4);
    assert_eq!(s.contacts().unwrap().len(), 2);
    s.delete_contact(&judge.id).unwrap();
    s.delete_contact(&client.id).unwrap();
    assert!(s.contact_links().unwrap().is_empty());
    assert!(s.contacts().unwrap().is_empty());
    assert!(matches!(s.delete_contact(&court.id), Err(Error::NotFound)));
    let p = s
        .workspace()
        .unwrap()
        .proceedings
        .into_iter()
        .find(|p| p.case_id == a.id)
        .unwrap();
    s.update_proceeding(UpdateProceeding {
        id: p.id,
        stage: p.stage,
        case_number: "编辑案号不会重新生成已删除对象".into(),
        court: p.court,
        judge: p.judge,
    })
    .unwrap();
    drop(s);
    let s = Store::open(&path).unwrap();
    let w = s.workspace().unwrap();
    assert!(w.contacts.is_empty());
    assert!(w.contact_links.is_empty());
    assert!(w.contact_relations.is_empty());
    assert_eq!(w.cases.len(), 2);
    assert!(w
        .cases
        .iter()
        .find(|c| c.id == b.id)
        .unwrap()
        .deleted_at
        .is_some());
    for p in w.proceedings {
        assert_eq!(p.court, court.name);
        assert_eq!(p.judge, judge.name);
    }
}
fn old_database(path: &std::path::Path) -> rusqlite::Connection {
    let db = rusqlite::Connection::open(path).unwrap();
    for sql in [
        include_str!("../migrations/001_initial.sql"),
        include_str!("../migrations/002_calendar_events.sql"),
        include_str!("../migrations/003_v1_workspace.sql"),
    ] {
        db.execute_batch(sql).unwrap();
    }
    db
}
#[test]
fn migration_reuses_existing_court_and_converts_legacy_names_once() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workspace.sqlite3");
    let db = old_database(&path);
    let c = person("虚构法院", "court");
    db.execute(
        "INSERT INTO contacts(id,name,kind) VALUES(?1,?2,'court')",
        [&c.id, &c.name],
    )
    .unwrap();
    for _ in 0..2 {
        let id = Uuid::new_v4().to_string();
        db.execute("INSERT INTO cases(id,title,case_type,status_id) VALUES(?1,'旧案','civil','in_progress')",[&id]).unwrap();
        db.execute("INSERT INTO proceedings(id,case_id,kind,court,judge) VALUES(?1,?2,'first_instance','虚构法院','虚构法官')",[Uuid::new_v4().to_string(),id]).unwrap();
    }
    drop(db);
    let s = Store::open(&path).unwrap();
    assert_eq!(s.contacts().unwrap().len(), 2);
    assert_eq!(s.contact_links().unwrap().len(), 4);
    assert_eq!(s.contact_relations().unwrap().len(), 1);
    assert_eq!(s.contact_relations().unwrap()[0].court_id, c.id);
    drop(s);
    let s = Store::open(&path).unwrap();
    assert_eq!(s.contacts().unwrap().len(), 2);
    assert_eq!(
        std::fs::read_dir(root.path().join("migration-backups"))
            .unwrap()
            .count(),
        1
    );
}
#[test]
fn ambiguous_old_names_remain_unmerged() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workspace.sqlite3");
    let db = old_database(&path);
    for _ in 0..2 {
        db.execute(
            "INSERT INTO contacts(id,name,kind) VALUES(?1,'重名法院','court')",
            [Uuid::new_v4().to_string()],
        )
        .unwrap();
    }
    let id = Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO cases(id,title,case_type,status_id) VALUES(?1,'旧案','civil','in_progress')",
        [&id],
    )
    .unwrap();
    db.execute(
        "INSERT INTO proceedings(id,case_id,kind,court) VALUES(?1,?2,'first_instance','重名法院')",
        [Uuid::new_v4().to_string(), id],
    )
    .unwrap();
    drop(db);
    let s = Store::open(&path).unwrap();
    assert_eq!(s.contacts().unwrap().len(), 2);
    assert!(s.contact_links().unwrap().is_empty());
    assert_eq!(s.workspace().unwrap().proceedings[0].court, "重名法院");
}
#[test]
fn version_three_complete_backup_restores_and_migrates_with_materials() {
    use sha2::{Digest, Sha256};
    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(&dir.path().join("data/workspace.sqlite3")).unwrap();
    let c = case(&mut s);
    let src = dir.path().join("证据.txt");
    std::fs::write(&src, "虚构材料").unwrap();
    s.import_materials(
        MaterialTarget {
            case_id: c.id.clone(),
            proceeding_id: None,
            parent_id: None,
            record_id: None,
        },
        &[src],
    )
    .unwrap();
    let b = s.create_backup(&dir.path().join("backups"), false).unwrap();
    let root = std::path::Path::new(&b.directory);
    let db = rusqlite::Connection::open(root.join("workspace.sqlite3")).unwrap();
    drop(db);
    let legacy = root.join("legacy.sqlite3");
    let db = rusqlite::Connection::open(&legacy).unwrap();
    db.execute_batch(include_str!("../migrations/001_initial.sql"))
        .unwrap();
    db.execute_batch(include_str!("../migrations/002_calendar_events.sql"))
        .unwrap();
    db.execute_batch(include_str!("../migrations/003_v1_workspace.sql"))
        .unwrap();
    db.execute(
        "ATTACH DATABASE ?1 AS recent",
        [root.join("workspace.sqlite3").to_str().unwrap()],
    )
    .unwrap();
    db.execute_batch("PRAGMA foreign_keys=OFF; INSERT INTO cases SELECT * FROM recent.cases; INSERT INTO proceedings(id,case_id,kind,stage,case_number,court,judge,created_at) SELECT id,case_id,kind,stage,case_number,court,judge,created_at FROM recent.proceedings; INSERT INTO materials SELECT * FROM recent.materials; DETACH DATABASE recent;").unwrap();
    drop(db);
    std::fs::remove_file(root.join("workspace.sqlite3")).unwrap();
    std::fs::rename(&legacy, root.join("workspace.sqlite3")).unwrap();
    let db = rusqlite::Connection::open(root.join("workspace.sqlite3")).unwrap();
    drop(db);
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(root.join("manifest.json")).unwrap()).unwrap();
    manifest["files"]["workspace.sqlite3"] = format!(
        "{:x}",
        Sha256::digest(std::fs::read(root.join("workspace.sqlite3")).unwrap())
    )
    .into();
    std::fs::write(
        root.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest).unwrap(),
    )
    .unwrap();
    s.trash_case(&c.id).unwrap();
    s.restore_backup(root, true).unwrap();
    assert!(s.workspace().unwrap().cases[0].deleted_at.is_none());
    assert_eq!(s.materials().unwrap().len(), 1);
    assert!(s.contact_relations().unwrap().is_empty());
}
