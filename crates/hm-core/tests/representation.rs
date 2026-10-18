use hm_core::*;
use uuid::Uuid;

fn archive(s: &mut Store, kind: &str) -> Case {
    s.create_case(CreateCase {
        id: Uuid::new_v4().to_string(),
        title: "身份建模验收（虚构）".into(),
        case_type: kind.into(),
        status_id: "in_progress".into(),
        tags: None,
    })
    .unwrap()
}
fn party(case: &Case) -> CaseParty {
    CaseParty {
        id: Uuid::new_v4().to_string(),
        case_id: case.id.clone(),
        contact_id: None,
        name: "委托人甲（虚构）".into(),
        side: "client".into(),
        service_type: "代理".into(),
    }
}
#[test]
fn creating_an_archive_never_creates_an_implicit_workflow() {
    let mut s = Store::memory().unwrap();
    for kind in ["civil", "other"] {
        let c = archive(&mut s, kind);
        assert!(c.current_proceeding_id.is_none());
    }
    let w = s.workspace().unwrap();
    assert!(w.proceedings.is_empty());
    assert!(w.stages.is_empty());
    assert_eq!(w.workflow_templates.len(), 6);
}
#[test]
fn templates_are_reusable_snapshots_and_archiving_does_not_erase_work() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("workspace.sqlite3");
    let mut s = Store::open(&file).unwrap();
    let c = archive(&mut s, "other");
    let mut t = WorkflowTemplate {
        id: Uuid::new_v4().to_string(),
        name: "专项尽调".into(),
        category: "non_litigation".into(),
        stages: vec!["资料接收".into(), "出具报告".into()],
    };
    s.save_workflow_template(t.clone()).unwrap();
    let first = s.add_proceeding(&c.id, &t.id).unwrap();
    t.name = "商业尽调".into();
    t.stages = vec!["启动".into()];
    s.save_workflow_template(t.clone()).unwrap();
    let next = s
        .add_named_proceeding(&c.id, &t.id, Some(&first), Some("第二轮尽调"))
        .unwrap();
    assert!(s
        .save_workflow_template(WorkflowTemplate {
            id: Uuid::new_v4().to_string(),
            ..t.clone()
        })
        .is_err());
    assert!(s
        .save_workflow_template(WorkflowTemplate {
            stages: vec!["Review".into(), "review".into()],
            ..t.clone()
        })
        .is_err());
    s.delete_workflow_template(&t.id).unwrap();
    assert!(s.add_proceeding(&c.id, &t.id).is_err());
    drop(s);
    let mut s = Store::open(&file).unwrap();
    let w = s.workspace().unwrap();
    assert!(!w.workflow_templates.iter().any(|x| x.id == t.id));
    assert_eq!(
        w.proceedings.iter().find(|p| p.id == first).unwrap().name,
        "专项尽调"
    );
    assert_eq!(
        w.proceedings.iter().find(|p| p.id == next).unwrap().name,
        "第二轮尽调"
    );
    assert_eq!(
        w.stages.iter().filter(|p| p.proceeding_id == first).count(),
        2
    );
    assert_eq!(
        w.stages.iter().filter(|p| p.proceeding_id == next).count(),
        1
    );
    t.stages.clear();
    s.save_workflow_template(t.clone()).unwrap();
    let empty = s.add_proceeding(&c.id, &t.id).unwrap();
    assert!(!s.stages().unwrap().iter().any(|x| x.proceeding_id == empty));
}
#[test]
fn role_is_scoped_to_workflow_and_is_not_inherited_or_guessed_from_contact_links() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("workspace.sqlite3");
    let mut s = Store::open(&file).unwrap();
    let c = archive(&mut s, "civil");
    let other = archive(&mut s, "civil");
    let p = party(&c);
    let first = s.add_proceeding(&c.id, "first_instance").unwrap();
    s.save_case_party(SaveCaseParty {
        party: p.clone(),
        proceeding_id: Some(first.clone()),
        role: "原告".into(),
    })
    .unwrap();
    let appeal = s
        .add_proceeding_from(&c.id, "appeal", Some(&first))
        .unwrap();
    assert_eq!(s.proceeding_party_roles().unwrap().len(), 1);
    s.save_case_party(SaveCaseParty {
        party: p.clone(),
        proceeding_id: Some(appeal.clone()),
        role: "被上诉人".into(),
    })
    .unwrap();
    let execution = s
        .add_proceeding_from(&c.id, "enforcement", Some(&first))
        .unwrap();
    s.save_case_party(SaveCaseParty {
        party: p.clone(),
        proceeding_id: Some(execution.clone()),
        role: "申请执行人".into(),
    })
    .unwrap();
    let wrong = s.add_proceeding(&other.id, "first_instance").unwrap();
    assert!(s
        .save_case_party(SaveCaseParty {
            party: p.clone(),
            proceeding_id: Some(wrong),
            role: "被告".into()
        })
        .is_err());
    assert!(s
        .save_case_party(SaveCaseParty {
            party: p.clone(),
            proceeding_id: None,
            role: "被告".into()
        })
        .is_err());
    s.select_proceeding(&c.id, &appeal).unwrap();
    drop(s);
    let mut s = Store::open(&file).unwrap();
    let w = s.workspace().unwrap();
    assert_eq!(
        w.cases
            .iter()
            .find(|x| x.id == c.id)
            .unwrap()
            .current_proceeding_id
            .as_deref(),
        Some(appeal.as_str())
    );
    for (id, role) in [
        (&first, "原告"),
        (&appeal, "被上诉人"),
        (&execution, "申请执行人"),
    ] {
        assert_eq!(
            w.proceeding_party_roles
                .iter()
                .find(|r| &r.proceeding_id == id)
                .unwrap()
                .role,
            role
        );
    }
    // Removing a role for one workflow must leave the others intact.
    s.save_case_party(SaveCaseParty {
        party: p.clone(),
        proceeding_id: Some(appeal),
        role: String::new(),
    })
    .unwrap();
    assert_eq!(s.proceeding_party_roles().unwrap().len(), 2);
    let b = s.create_backup(&dir.path().join("backups"), false).unwrap();
    s.delete_case_party(&p.id).unwrap();
    s.restore_backup(std::path::Path::new(&b.directory), true)
        .unwrap();
    assert_eq!(s.case_parties().unwrap().len(), 1);
    assert_eq!(s.proceeding_party_roles().unwrap().len(), 2);
    s.trash_case(&c.id).unwrap();
    s.purge_item("case", &c.id, true).unwrap();
    assert!(s.case_parties().unwrap().is_empty());
    assert!(s.proceeding_party_roles().unwrap().is_empty());
}
#[test]
fn optional_contact_can_be_renamed_unlinked_or_deleted_without_losing_identity() {
    let mut s = Store::memory().unwrap();
    let c = archive(&mut s, "civil");
    let first = s.add_proceeding(&c.id, "first_instance").unwrap();
    let mut contact = Contact {
        id: Uuid::new_v4().to_string(),
        name: "客户甲".into(),
        kind: "person".into(),
        phone: String::new(),
        address: String::new(),
        notes: String::new(),
    };
    s.save_contact(contact.clone()).unwrap();
    s.save_contact_link(ContactLink {
        id: Uuid::new_v4().to_string(),
        contact_id: contact.id.clone(),
        case_id: c.id.clone(),
        proceeding_id: Some(first.clone()),
        role: "原告".into(),
    })
    .unwrap();
    assert!(s.case_parties().unwrap().is_empty()); // A directory role does not identify our client.
    let mut p = party(&c);
    p.contact_id = Some(contact.id.clone());
    s.save_case_party(SaveCaseParty {
        party: p.clone(),
        proceeding_id: Some(first.clone()),
        role: "原告".into(),
    })
    .unwrap();
    let links = s.contact_links().unwrap();
    let managed = links.iter().find(|l| l.role == "我方委托人").unwrap();
    assert!(s
        .save_contact_link(ContactLink {
            role: "篡改".into(),
            ..managed.clone()
        })
        .is_err());
    contact.name = "客户改名".into();
    s.save_contact(contact.clone()).unwrap();
    assert_eq!(s.case_parties().unwrap()[0].name, "客户改名");
    s.delete_contact_link(&managed.id).unwrap();
    assert!(s.case_parties().unwrap()[0].contact_id.is_none());
    assert_eq!(s.contact_links().unwrap().len(), 1); // Independent user link retained.
    s.save_case_party(SaveCaseParty {
        party: p,
        proceeding_id: Some(first),
        role: "原告".into(),
    })
    .unwrap();
    s.delete_contact(&contact.id).unwrap();
    let saved = &s.case_parties().unwrap()[0];
    assert!(saved.contact_id.is_none());
    assert_eq!(saved.name, "客户改名");
    assert_eq!(s.proceeding_party_roles().unwrap()[0].role, "原告");
}
#[test]
fn v5_rebuild_preserves_dependent_records_and_keeps_foreign_keys_enabled() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("workspace.sqlite3");
    let db = rusqlite::Connection::open(&file).unwrap();
    for sql in [
        include_str!("../migrations/001_initial.sql"),
        include_str!("../migrations/002_calendar_events.sql"),
        include_str!("../migrations/003_v1_workspace.sql"),
        include_str!("../migrations/004_contact_relations.sql"),
        include_str!("../migrations/005_case_overview.sql"),
    ] {
        db.execute_batch(sql).unwrap();
    }
    db.execute_batch("INSERT INTO cases(id,title,case_type,status_id,current_proceeding_id) VALUES('old-case','旧版案件','civil','in_progress','old-appeal'); INSERT INTO proceedings(id,case_id,kind,stage,case_number) VALUES('old-first','old-case','first_instance','举证','原案号'); INSERT INTO proceedings(id,case_id,kind,parent_id) VALUES('old-appeal','old-case','appeal','old-first'); INSERT INTO stages(id,proceeding_id,name,position,state) VALUES('old-stage','old-first','举证',0,'current'); INSERT INTO materials(id,case_id,proceeding_id,name,kind) VALUES('old-folder','old-case','old-first','旧材料目录','folder'); INSERT INTO ledger_entries(id,case_id,proceeding_id,kind,amount_cents,entry_date,material_id) VALUES('old-income','old-case','old-first','income',10000,'2026-10-18','old-folder'); INSERT INTO case_events(id,case_id,proceeding_id,title,event_date) VALUES('old-event','old-case','old-first','已有事项','2026-10-18'); INSERT INTO contacts(id,name,kind) VALUES('old-person','旧联系人','person'); INSERT INTO contact_links(id,contact_id,case_id,proceeding_id,role) VALUES('old-link','old-person','old-case','old-first','原告');").unwrap();
    drop(db);
    let s = Store::open(&file).unwrap();
    let w = s.workspace().unwrap();
    assert_eq!(w.proceedings.len(), 2);
    let first = w.proceedings.iter().find(|p| p.id == "old-first").unwrap();
    let appeal = w.proceedings.iter().find(|p| p.id == "old-appeal").unwrap();
    assert_eq!(first.case_number, "原案号");
    assert_eq!(first.name, "一审");
    assert_eq!(appeal.parent_id.as_deref(), Some("old-first"));
    assert_eq!(w.materials[0].id, "old-folder");
    assert_eq!(w.ledger_entries[0].id, "old-income");
    assert_eq!(w.case_events[0].id, "old-event");
    assert_eq!(w.stages[0].id, "old-stage");
    assert_eq!(w.contact_links[0].id, "old-link");
    assert!(w.case_parties.is_empty());
    assert!(w.proceeding_party_roles.is_empty());
    let check = rusqlite::Connection::open(&file).unwrap();
    assert!(!check
        .prepare("PRAGMA foreign_key_check")
        .unwrap()
        .exists([])
        .unwrap());
    assert_eq!(
        check
            .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        6
    );
    assert!(s
        .save_contact_link(ContactLink {
            id: Uuid::new_v4().to_string(),
            case_id: "old-case".into(),
            contact_id: "missing".into(),
            proceeding_id: None,
            role: "联系人".into()
        })
        .is_err());
    assert_eq!(
        std::fs::read_dir(dir.path().join("migration-backups"))
            .unwrap()
            .count(),
        1
    );
}
