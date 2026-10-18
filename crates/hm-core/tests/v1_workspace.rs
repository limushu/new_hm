use hm_core::*;
use std::path::Path;
use uuid::Uuid;
#[test]
fn status_catalog_persists_and_rejects_duplicate_names_without_changing_cases() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.sqlite3");
    let mut store = Store::open(&path).unwrap();
    let item = case(&mut store, "状态候选验收");
    let status = CaseStatus {
        id: Uuid::new_v4().to_string(),
        name: "Review".into(),
        color: "#768b9a".into(),
    };
    store.save_case_status(status.clone()).unwrap();
    store.set_case_status(&item.id, &status.id).unwrap();
    assert!(store
        .save_case_status(CaseStatus {
            id: Uuid::new_v4().to_string(),
            name: " review ".into(),
            ..status.clone()
        })
        .is_err());
    assert!(store
        .save_case_status(CaseStatus {
            id: "not_started".into(),
            ..status.clone()
        })
        .is_err());
    assert_eq!(store.workspace().unwrap().statuses.len(), 4);
    assert_eq!(store.workspace().unwrap().cases[0].status_id, status.id);
    // Old duplicate names are left intact; changing only their color remains possible.
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute(
        "INSERT INTO case_statuses(id,name,color,position) VALUES(?1,'Review','#768b9a',99)",
        [Uuid::new_v4().to_string()],
    )
    .unwrap();
    store
        .save_case_status(CaseStatus {
            color: "#335577".into(),
            ..status.clone()
        })
        .unwrap();
    drop(store);
    let reopened = Store::open(&path).unwrap().workspace().unwrap();
    assert_eq!(reopened.cases[0].status_id, status.id);
    assert_eq!(
        reopened
            .statuses
            .iter()
            .find(|s| s.id == status.id)
            .unwrap()
            .color,
        "#335577"
    );
    assert_eq!(
        reopened
            .statuses
            .iter()
            .find(|s| s.id == "not_started")
            .unwrap()
            .name,
        "未开始"
    );
}
#[test]
fn version_two_stage_migration_keeps_one_current_stage_and_original_database() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.sqlite3");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch(include_str!("../migrations/001_initial.sql"))
        .unwrap();
    db.execute_batch(include_str!("../migrations/002_calendar_events.sql"))
        .unwrap();
    let case_id = Uuid::new_v4().to_string();
    let program_id = Uuid::new_v4().to_string();
    db.execute("INSERT INTO cases(id,title,case_type,status_id) VALUES(?1,'旧版虚构案件','civil','in_progress')",[&case_id]).unwrap();
    db.execute(
        "INSERT INTO proceedings(id,case_id,kind,stage) VALUES(?1,?2,'first_instance','举证')",
        [&program_id, &case_id],
    )
    .unwrap();
    drop(db);
    let store = Store::open(&path).unwrap();
    let stages = store.stages().unwrap();
    assert_eq!(stages.len(), 5);
    assert_eq!(stages.iter().filter(|s| s.state == "current").count(), 1);
    assert_eq!(
        stages.iter().find(|s| s.state == "current").unwrap().name,
        "举证"
    );
    assert_eq!(store.workspace().unwrap().proceedings[0].stage, "举证");
    let snapshot = std::fs::read_dir(dir.path().join("migration-backups"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let old = rusqlite::Connection::open(snapshot).unwrap();
    assert_eq!(
        old.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        2
    );
}
fn case(store: &mut Store, title: &str) -> Case {
    store
        .create_case(CreateCase {
            tags: None,
            id: Uuid::new_v4().to_string(),
            title: title.into(),
            case_type: "civil".into(),
            status_id: "not_started".into(),
        })
        .unwrap()
}
fn target(c: &Case) -> MaterialTarget {
    MaterialTarget {
        case_id: c.id.clone(),
        proceeding_id: None,
        parent_id: None,
        record_id: None,
    }
}
fn contact() -> Contact {
    Contact {
        id: Uuid::new_v4().to_string(),
        name: "虚构联系人".into(),
        kind: "person".into(),
        phone: "示例电话".into(),
        address: "示例地址".into(),
        notes: String::new(),
    }
}
#[test]
fn material_copy_duplicates_rename_move_and_external_edit_keep_source_safe() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("data/workspace.sqlite3")).unwrap();
    let a = case(&mut store, "甲案");
    let b = case(&mut store, "乙案");
    let source = dir.path().join("证据.txt");
    std::fs::write(&source, "原始证据").unwrap();
    let report = store
        .import_materials(target(&a), &[source.clone(), source.clone()])
        .unwrap();
    assert_eq!(report.imported, 2);
    assert!(report.errors.is_empty());
    let rows = store.materials().unwrap();
    assert!(rows.iter().any(|m| m.name == "证据 (1).txt"));
    let id = rows
        .iter()
        .find(|m| m.name == "证据.txt")
        .unwrap()
        .id
        .clone();
    let copy = store.material_path(&id).unwrap();
    assert_ne!(copy, source);
    std::fs::write(&copy, "外部编辑").unwrap();
    assert_eq!(std::fs::read_to_string(&source).unwrap(), "原始证据");
    store.rename_material(&id, "重命名证据.txt").unwrap();
    assert!(store.rename_material(&id, "../../bad.txt").is_err());
    assert!(store.rename_material(&id, "证据.exe").is_err());
    let folder = store
        .create_material_folder(target(&a), "往来材料")
        .unwrap();
    let mut destination = target(&a);
    destination.parent_id = Some(folder.clone());
    store.move_material(&id, destination.clone()).unwrap();
    assert_eq!(store.material(&id).unwrap().parent_id, Some(folder.clone()));
    assert!(store.move_material(&folder, destination).is_err());
    assert!(store.move_material(&id, target(&b)).is_err());
    let exported = dir.path().join("导出.txt");
    store.export_material(&id, &exported).unwrap();
    assert_eq!(std::fs::read_to_string(exported).unwrap(), "外部编辑");
    assert!(store
        .export_material(&id, &dir.path().join("data/workspace.sqlite3"))
        .is_err());
}
#[test]
fn folder_trash_restores_its_group_and_purge_requires_confirmation() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("db/workspace.sqlite3")).unwrap();
    let c = case(&mut store, "回收测试");
    let folder = store.create_material_folder(target(&c), "证据").unwrap();
    let mut t = target(&c);
    t.parent_id = Some(folder.clone());
    let source = dir.path().join("附件.txt");
    std::fs::write(&source, "附件").unwrap();
    store.import_materials(t, &[source]).unwrap();
    let file = store
        .materials()
        .unwrap()
        .into_iter()
        .find(|m| m.kind == "file")
        .unwrap();
    store.trash_item("material", &file.id).unwrap();
    store.trash_item("material", &folder).unwrap();
    store.restore_item("material", &folder).unwrap();
    assert!(store.material(&file.id).is_err());
    store.restore_item("material", &file.id).unwrap();
    assert!(store.material_path(&file.id).is_ok());
    store.trash_item("material", &folder).unwrap();
    assert!(store.purge_item("material", &folder, false).is_err());
    store.purge_item("material", &folder, true).unwrap();
    assert!(store.materials().unwrap().is_empty());
}
#[test]
fn contacts_case_roles_finance_and_archive_are_isolated() {
    let mut store = Store::memory().unwrap();
    let a = case(&mut store, "收支甲案");
    let b = case(&mut store, "收支乙案");
    let person = contact();
    store.save_contact(person.clone()).unwrap();
    store
        .save_contact_link(ContactLink {
            id: Uuid::new_v4().to_string(),
            case_id: a.id.clone(),
            contact_id: person.id.clone(),
            proceeding_id: None,
            role: "原告".into(),
        })
        .unwrap();
    store
        .save_contact_link(ContactLink {
            id: Uuid::new_v4().to_string(),
            case_id: b.id.clone(),
            contact_id: person.id.clone(),
            proceeding_id: None,
            role: "被告".into(),
        })
        .unwrap();
    let original_link = store
        .contact_links()
        .unwrap()
        .into_iter()
        .find(|l| l.case_id == a.id)
        .unwrap();
    let mut moved = original_link.clone();
    moved.case_id = b.id.clone();
    moved.role = "第三人".into();
    assert!(store.save_contact_link(moved).is_err());
    assert!(store
        .contact_links()
        .unwrap()
        .iter()
        .any(|l| l.id == original_link.id && l.case_id == a.id));
    let mut entry = LedgerEntry {
        id: Uuid::new_v4().to_string(),
        case_id: a.id.clone(),
        proceeding_id: a.current_proceeding_id.clone(),
        kind: "expense".into(),
        amount_cents: 12345,
        entry_date: "2026-10-18".into(),
        category: "交通费".into(),
        notes: "垫付".into(),
        reimbursement: "pending".into(),
        material_id: None,
    };
    store.save_ledger(entry.clone()).unwrap();
    entry.proceeding_id = b.current_proceeding_id.clone();
    assert!(store.save_ledger(entry.clone()).is_err());
    entry.proceeding_id = None;
    entry.kind = "income".into();
    assert!(store.save_ledger(entry).is_err());
    assert_eq!(store.ledger_entries().unwrap()[0].amount_cents, 12345);
    store.trash_case(&a.id).unwrap();
    store.purge_item("case", &a.id, true).unwrap();
    assert_eq!(store.contacts().unwrap().len(), 1);
    assert_eq!(store.contact_links().unwrap().len(), 1);
    assert!(store.ledger_entries().unwrap().is_empty());
    assert_eq!(store.workspace().unwrap().cases[0].id, b.id);
}
#[test]
fn stages_and_record_edits_preserve_history_without_closing_case() {
    let mut store = Store::memory().unwrap();
    let c = case(&mut store, "阶段测试");
    let rows = store.stages().unwrap();
    assert_eq!(rows.len(), 5);
    assert_eq!(rows.iter().filter(|s| s.state == "current").count(), 1);
    let mut next = rows[2].clone();
    next.state = "current".into();
    store.save_stage(next.clone()).unwrap();
    store.save_stage(next).unwrap();
    assert_eq!(store.case_events().unwrap().len(), 1);
    assert_eq!(store.workspace().unwrap().cases[0].status_id, "not_started");
    assert!(store
        .reorder_stages(c.current_proceeding_id.as_ref().unwrap(), &[])
        .is_err());
    let input = RecordInput {
        id: Uuid::new_v4().to_string(),
        case_id: c.id.clone(),
        body: "初始记录".into(),
    };
    store.save_record(input.clone()).unwrap();
    store
        .save_record(RecordInput {
            body: "已修改".into(),
            ..input.clone()
        })
        .unwrap();
    assert_eq!(store.workspace().unwrap().work_records.len(), 1);
    store.trash_item("record", &input.id).unwrap();
    assert!(store.save_record(input.clone()).is_err());
    store.restore_item("record", &input.id).unwrap();
    assert_eq!(store.workspace().unwrap().work_records[0].body, "已修改");
}
#[test]
fn backup_restore_roundtrip_includes_files_and_retains_recovery() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("data/workspace.sqlite3")).unwrap();
    let c = case(&mut store, "备份原案");
    let source = dir.path().join("证据.txt");
    std::fs::write(&source, "备份中的内容").unwrap();
    store.import_materials(target(&c), &[source]).unwrap();
    let backup = store
        .create_backup(&dir.path().join("backups"), true)
        .unwrap();
    assert_eq!(backup.file_count, 1);
    Store::inspect_backup(Path::new(&backup.directory)).unwrap();
    case(&mut store, "备份后的案件");
    let id = store.materials().unwrap()[0].id.clone();
    std::fs::write(store.material_path(&id).unwrap(), "后来的改动").unwrap();
    assert!(store
        .restore_backup(Path::new(&backup.directory), false)
        .is_err());
    let recovery = store
        .restore_backup(Path::new(&backup.directory), true)
        .unwrap();
    assert_eq!(store.workspace().unwrap().cases.len(), 1);
    assert_eq!(
        std::fs::read_to_string(store.material_path(&id).unwrap()).unwrap(),
        "备份中的内容"
    );
    assert_eq!(
        Store::inspect_backup(Path::new(&recovery.directory))
            .unwrap()
            .case_count,
        2
    );
}
#[test]
fn tampered_backup_is_refused_without_modifying_workspace_and_retention_is_seven() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("data/workspace.sqlite3")).unwrap();
    case(&mut store, "不能丢失的案件");
    let root = dir.path().join("backups");
    let mut latest = None;
    for _ in 0..9 {
        latest = Some(store.create_backup(&root, true).unwrap());
    }
    assert_eq!(std::fs::read_dir(&root).unwrap().count(), 7);
    let latest = latest.unwrap();
    std::fs::write(
        Path::new(&latest.directory).join("workspace.sqlite3"),
        b"bad database",
    )
    .unwrap();
    assert!(store
        .restore_backup(Path::new(&latest.directory), true)
        .is_err());
    assert_eq!(store.workspace().unwrap().cases.len(), 1);
}
#[test]
fn reminders_are_local_time_deduplicated_and_rescheduled_explicitly() {
    let store = Store::memory().unwrap();
    let mut event = CalendarEvent {
        id: Uuid::new_v4().to_string(),
        title: "开庭提醒".into(),
        start_date: "2026-10-18".into(),
        end_date: "2026-10-18".into(),
        start_time: Some("10:00".into()),
        end_time: Some("10:30".into()),
        case_id: None,
        location: String::new(),
        notes: String::new(),
        reminder_minutes: Some(15),
    };
    store.save_calendar_event(event.clone()).unwrap();
    let parse = |value| chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M").unwrap();
    assert!(store
        .due_reminders(parse("2026-10-18 09:44"))
        .unwrap()
        .is_empty());
    let reminder = store
        .due_reminders(parse("2026-10-18 09:45"))
        .unwrap()
        .remove(0);
    store
        .acknowledge_reminder(&reminder.event_id, &reminder.schedule_key)
        .unwrap();
    assert!(store
        .due_reminders(parse("2026-10-18 10:00"))
        .unwrap()
        .is_empty());
    event.start_time = Some("11:00".into());
    event.end_time = Some("11:30".into());
    store.save_calendar_event(event).unwrap();
    assert_eq!(
        store
            .due_reminders(parse("2026-10-18 10:45"))
            .unwrap()
            .len(),
        1
    );
}
#[test]
fn interrupted_restore_is_recovered_on_next_open() {
    let dir = tempfile::tempdir().unwrap();
    let data = dir.path().join("data");
    let path = data.join("workspace.sqlite3");
    let mut store = Store::open(&path).unwrap();
    let c = case(&mut store, "恢复前案件");
    let source = dir.path().join("原始附件.txt");
    std::fs::write(&source, "恢复前内容").unwrap();
    store.import_materials(target(&c), &[source]).unwrap();
    let recovery = store.create_backup(&data.join("recovery"), false).unwrap();
    let old = format!(".materials-before-{}", Uuid::new_v4());
    std::fs::rename(data.join("materials"), data.join(&old)).unwrap();
    store.set_case_status(&c.id, "closed").unwrap();
    drop(store);
    std::fs::write(
        data.join("restore-journal.json"),
        serde_json::to_vec(
            &serde_json::json!({"recovery_directory":recovery.directory,"old_directory":old}),
        )
        .unwrap(),
    )
    .unwrap();
    let store = Store::open(&path).unwrap();
    assert_eq!(store.workspace().unwrap().cases[0].status_id, "not_started");
    let id = store.materials().unwrap()[0].id.clone();
    assert_eq!(
        std::fs::read_to_string(store.material_path(&id).unwrap()).unwrap(),
        "恢复前内容"
    );
    assert!(store.setting("recovery_notice").unwrap().is_some());
    assert!(!data.join("restore-journal.json").exists());
}
