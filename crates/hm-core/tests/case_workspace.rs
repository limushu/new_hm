use hm_core::*;
use uuid::Uuid;
fn id() -> String {
    Uuid::new_v4().to_string()
}
fn archive(s: &mut Store) -> String {
    s.create_case(CreateCase {
        id: id(),
        title: "工作空间验收（虚构）".into(),
        case_type: "civil".into(),
        status_id: "in_progress".into(),
        tags: None,
    })
    .unwrap()
    .id
}
fn scope(s: &mut Store, c: &str) -> (String, String) {
    let p = s.add_proceeding(c, "first_instance").unwrap();
    let stage = s
        .workspace()
        .unwrap()
        .stages
        .into_iter()
        .find(|v| v.proceeding_id == p)
        .unwrap()
        .id;
    (p, stage)
}
fn task(c: &str, p: &str, stage: &str) -> SaveWorkTask {
    SaveWorkTask {
        task: Task {
            id: id(),
            case_id: c.into(),
            title: "整理证据目录".into(),
            due_date: Some("2026-10-24".into()),
            completed: false,
        },
        waiting_for: "客户补充流水".into(),
        outcome: String::new(),
        proceeding_id: Some(p.into()),
        stage_id: Some(stage.into()),
    }
}
fn ledger(c: &str, p: &str) -> LedgerEntry {
    LedgerEntry {
        id: id(),
        case_id: c.into(),
        proceeding_id: Some(p.into()),
        kind: "income".into(),
        amount_cents: 1200000,
        entry_date: "2026-10-18".into(),
        category: "律师费".into(),
        notes: String::new(),
        reimbursement: "none".into(),
        material_id: None,
    }
}
fn plan(c: &str, p: &str, stage: &str) -> FeePlan {
    FeePlan {
        id: id(),
        case_id: c.into(),
        proceeding_id: Some(p.into()),
        stage_id: Some(stage.into()),
        title: "首期款".into(),
        amount_cents: 1200000,
        due_date: Some("2026-10-18".into()),
        condition: String::new(),
        ready: false,
    }
}
#[test]
fn one_task_projects_to_case_and_calendar_and_invalid_scope_cannot_partially_save() {
    let mut s = Store::memory().unwrap();
    let c = archive(&mut s);
    let (p, stage) = scope(&mut s, &c);
    let other = archive(&mut s);
    let (_, wrong) = scope(&mut s, &other);
    let mut v = task(&c, &p, &stage);
    let task_id = v.task.id.clone();
    s.save_work_task(v).unwrap();
    let w = s.workspace().unwrap();
    assert_eq!(w.tasks.len(), 1);
    assert_eq!(w.work_links.len(), 1);
    assert_eq!(w.task_work[0].waiting_for, "客户补充流水");
    assert_eq!(w.tasks[0].due_date.as_deref(), Some("2026-10-24"));
    v = task(&c, &p, &wrong);
    v.task.id = task_id.clone();
    v.task.title = "不应写入".into();
    assert!(s.save_work_task(v).is_err());
    let w = s.workspace().unwrap();
    assert_eq!(w.tasks[0].title, "整理证据目录");
    assert_eq!(w.work_links[0].stage_id.as_deref(), Some(stage.as_str()));
    let mut long = task(&c, &p, &stage);
    long.task.id = task_id.clone();
    long.task.title = "旧待办内容".repeat(80);
    s.save_work_task(long).unwrap();
    assert!(s.workspace().unwrap().tasks[0].title.chars().count() > 200);
    s.toggle_task(&task_id, true).unwrap();
    assert!(s.workspace().unwrap().tasks[0].completed);
    let w = s.workspace().unwrap();
    s.save_work_task(SaveWorkTask {
        task: w.tasks[0].clone(),
        waiting_for: String::new(),
        outcome: "已提交，回执已归档".into(),
        proceeding_id: None,
        stage_id: None,
    })
    .unwrap();
    assert!(s.workspace().unwrap().work_links.is_empty());
}
#[test]
fn shared_material_is_stored_once_and_stage_deletion_preserves_every_record() {
    let root = tempfile::tempdir().unwrap();
    let mut s = Store::open(&root.path().join("workspace.sqlite3")).unwrap();
    let c = archive(&mut s);
    let (p, stage) = scope(&mut s, &c);
    let p2 = s.add_proceeding(&c, "enforcement").unwrap();
    let stage2 = s
        .workspace()
        .unwrap()
        .stages
        .into_iter()
        .find(|v| v.proceeding_id == p2)
        .unwrap()
        .id;
    let source = root.path().join("证据.txt");
    std::fs::write(&source, "only one original").unwrap();
    s.import_materials(
        MaterialTarget {
            case_id: c.clone(),
            proceeding_id: Some(p.clone()),
            stage_id: Some(stage.clone()),
            parent_id: None,
            record_id: None,
        },
        std::slice::from_ref(&source),
    )
    .unwrap();
    let m = s.workspace().unwrap().materials[0].clone();
    let stored = s.material_path(&m.id).unwrap();
    // Two stage uses in one proceeding can both become stage-less. The file
    // and both usage notes must survive; nullable scope convergence is valid.
    let same_stage = s
        .workspace()
        .unwrap()
        .stages
        .into_iter()
        .find(|v| v.proceeding_id == p && v.id != stage)
        .unwrap()
        .id;
    s.save_work_link(WorkLink {
        id: id(),
        case_id: c.clone(),
        proceeding_id: p.clone(),
        stage_id: Some(same_stage.clone()),
        kind: "material".into(),
        resource_id: m.id.clone(),
        label: "另一个阶段的用途".into(),
    })
    .unwrap();
    for _ in 0..2 {
        s.save_work_link(WorkLink {
            id: id(),
            case_id: c.clone(),
            proceeding_id: p2.clone(),
            stage_id: Some(stage2.clone()),
            kind: "material".into(),
            resource_id: m.id.clone(),
            label: "执行依据".into(),
        })
        .unwrap();
    }
    let t = task(&c, &p, &stage);
    s.save_work_task(t).unwrap();
    let e = ledger(&c, &p);
    s.save_work_ledger(e.clone(), Some(stage.clone()), None, None)
        .unwrap();
    assert!(s
        .save_work_link(WorkLink {
            id: id(),
            case_id: c.clone(),
            proceeding_id: p2.clone(),
            stage_id: Some(stage2.clone()),
            kind: "ledger".into(),
            resource_id: e.id.clone(),
            label: String::new()
        })
        .is_err());
    assert_eq!(
        s.workspace().unwrap().ledger_entries[0]
            .proceeding_id
            .as_deref(),
        Some(p.as_str())
    );
    s.save_fee_plan(plan(&c, &p, &stage)).unwrap();
    s.delete_stage(&stage).unwrap();
    s.delete_stage(&same_stage).unwrap();
    let w = s.workspace().unwrap();
    assert_eq!(w.materials.len(), 1);
    assert_eq!(
        w.work_links.iter().filter(|l| l.kind == "material").count(),
        3
    );
    assert!(w
        .work_links
        .iter()
        .filter(|l| l.proceeding_id == p)
        .all(|l| l.stage_id.is_none()));
    assert!(w.fee_plans[0].stage_id.is_none());
    assert_eq!(w.tasks.len(), 1);
    assert_eq!(w.ledger_entries[0].id, e.id);
    assert_eq!(
        std::fs::read_to_string(stored).unwrap(),
        "only one original"
    );
    assert_eq!(
        std::fs::read_to_string(source).unwrap(),
        "only one original"
    );
}
#[test]
fn explicit_checklist_is_retry_safe_and_reopening_never_recreates_work() {
    let mut s = Store::memory().unwrap();
    let c = archive(&mut s);
    let (p, stage) = scope(&mut s, &c);
    s.apply_stage_tasks(
        &stage,
        vec!["核对材料".into(), "核对材料".into(), "联系客户".into()],
    )
    .unwrap();
    let w = s.workspace().unwrap();
    assert_eq!(w.tasks.len(), 2);
    s.toggle_task(&w.tasks[0].id, true).unwrap();
    let mut stage = s
        .workspace()
        .unwrap()
        .stages
        .into_iter()
        .find(|v| v.id == stage)
        .unwrap();
    stage.state = "done".into();
    s.save_stage(stage.clone()).unwrap();
    stage.state = "pending".into();
    s.save_stage(stage.clone()).unwrap();
    s.apply_stage_tasks(&stage.id, vec!["核对材料".into(), "联系客户".into()])
        .unwrap();
    assert_eq!(s.workspace().unwrap().tasks.len(), 2);
    assert!(s.workspace().unwrap().tasks.iter().any(|v| v.completed));
    assert!(s
        .apply_stage_tasks(&stage.id, vec!["应回滚".into(), "".into()])
        .is_err());
    assert_eq!(s.workspace().unwrap().tasks.len(), 2);
    assert_eq!(s.workspace().unwrap().proceedings[0].id, p);
}
#[test]
fn collection_allocations_never_invent_receipts_or_double_count_and_reject_invalid_edits() {
    let mut s = Store::memory().unwrap();
    let c = archive(&mut s);
    let (p, stage) = scope(&mut s, &c);
    let mut first = plan(&c, &p, &stage);
    s.save_fee_plan(first.clone()).unwrap();
    let mut second = first.clone();
    second.id = id();
    second.title = "后期款".into();
    s.save_fee_plan(second.clone()).unwrap();
    let mut receipt = ledger(&c, &p);
    s.save_ledger(receipt.clone()).unwrap();
    let mut a = FeeAllocation {
        plan_id: first.id.clone(),
        ledger_id: receipt.id.clone(),
        amount_cents: 800000,
    };
    s.save_fee_allocation(a.clone()).unwrap();
    s.save_fee_allocation(a.clone()).unwrap();
    assert_eq!(s.workspace().unwrap().ledger_entries.len(), 1);
    assert_eq!(s.workspace().unwrap().fee_allocations.len(), 1);
    a.plan_id = second.id.clone();
    a.amount_cents = 500000;
    assert!(s.save_fee_allocation(a).is_err());
    receipt.amount_cents = 700000;
    assert!(s.save_ledger(receipt.clone()).is_err());
    first.amount_cents = 600000;
    assert!(s.save_fee_plan(first.clone()).is_err());
    let other = archive(&mut s);
    let (other_p, _) = scope(&mut s, &other);
    let foreign = ledger(&other, &other_p);
    s.save_ledger(foreign.clone()).unwrap();
    assert!(s
        .save_fee_allocation(FeeAllocation {
            plan_id: first.id.clone(),
            ledger_id: foreign.id,
            amount_cents: 1
        })
        .is_err());
    s.delete_fee_plan(&first.id).unwrap();
    assert_eq!(s.workspace().unwrap().ledger_entries.len(), 2);
    assert!(s.workspace().unwrap().fee_allocations.is_empty());
    s.save_fee_agreement(&c, 0).unwrap();
    assert!(s.workspace().unwrap().confirmed_fee_cases.contains(&c));
}
#[test]
fn scoped_events_records_and_receipts_are_atomic_and_survive_backup_and_purge() {
    let root = tempfile::tempdir().unwrap();
    let db = root.path().join("workspace.sqlite3");
    let mut s = Store::open(&db).unwrap();
    let c = archive(&mut s);
    let (p, stage) = scope(&mut s, &c);
    let event = CalendarEvent {
        id: id(),
        case_id: Some(c.clone()),
        title: "证据会议".into(),
        start_date: "2026-10-20".into(),
        end_date: "2026-10-20".into(),
        start_time: Some("09:00".into()),
        end_time: Some("09:30".into()),
        location: String::new(),
        notes: String::new(),
        reminder_minutes: None,
    };
    s.save_work_event(event.clone(), Some(p.clone()), Some(stage.clone()))
        .unwrap();
    s.save_work_event(event.clone(), Some(p.clone()), Some(stage.clone()))
        .unwrap();
    assert_eq!(s.workspace().unwrap().calendar_events.len(), 1);
    assert!(s
        .save_work_event(
            CalendarEvent {
                title: "不应保存".into(),
                ..event
            },
            Some(p.clone()),
            Some(id())
        )
        .is_err());
    assert_eq!(s.workspace().unwrap().calendar_events[0].title, "证据会议");
    s.save_work_record(
        RecordInput {
            id: id(),
            case_id: c.clone(),
            body: "已反馈".into(),
        },
        Some(p.clone()),
        Some(stage.clone()),
    )
    .unwrap();
    let source = root.path().join("发票.txt");
    std::fs::write(&source, "receipt").unwrap();
    let mut e = ledger(&c, &p);
    e.kind = "expense".into();
    e.category = "交通费".into();
    let receipt_id = id();
    s.save_work_ledger(
        e.clone(),
        Some(stage.clone()),
        Some(&source),
        Some(&receipt_id),
    )
    .unwrap();
    s.save_work_ledger(e, Some(stage), Some(&source), Some(&receipt_id))
        .unwrap();
    let w = s.workspace().unwrap();
    assert_eq!(w.materials.len(), 1);
    assert_eq!(w.ledger_entries.len(), 1);
    assert_eq!(w.work_links.len(), 4);
    let backups = root.path().join("backups");
    let backup = s.create_backup(&backups, false).unwrap();
    drop(s);
    let mut s = Store::open(&db).unwrap();
    assert_eq!(s.workspace().unwrap().work_links.len(), 4);
    s.restore_backup(std::path::Path::new(&backup.directory), true)
        .unwrap();
    assert_eq!(s.workspace().unwrap().work_links.len(), 4);
    assert_eq!(s.workspace().unwrap().materials[0].id, receipt_id);
    s.trash_case(&c).unwrap();
    s.purge_item("case", &c, true).unwrap();
    assert!(s.workspace().unwrap().work_links.is_empty());
    assert!(s.workspace().unwrap().fee_plans.is_empty());
}
#[test]
fn schema_six_upgrade_preserves_unassigned_legacy_work_and_unknown_zero_agreement() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workspace.sqlite3");
    let db = rusqlite::Connection::open(&path).unwrap();
    for migration in [
        include_str!("../migrations/001_initial.sql"),
        include_str!("../migrations/002_calendar_events.sql"),
        include_str!("../migrations/003_v1_workspace.sql"),
        include_str!("../migrations/004_contact_relations.sql"),
        include_str!("../migrations/005_case_overview.sql"),
        include_str!("../migrations/006_workflows_and_representation.sql"),
    ] {
        db.execute_batch(migration).unwrap();
    }
    db.execute_batch("INSERT INTO cases(id,title,case_type,status_id) VALUES('old','旧档案','civil','in_progress');INSERT INTO tasks(id,case_id,title) VALUES('old-task','old','旧待办');INSERT INTO case_details(case_id,agreed_fee_cents,notes) VALUES('old',0,'保留的备注');").unwrap();
    drop(db);
    let s = Store::open(&path).unwrap();
    let w = s.workspace().unwrap();
    assert_eq!(w.tasks[0].id, "old-task");
    assert!(w.work_links.is_empty());
    assert!(w.fee_plans.is_empty());
    assert!(w.confirmed_fee_cases.is_empty());
    assert_eq!(w.case_details[0].notes, "保留的备注");
    assert!(std::fs::read_dir(root.path().join("migration-backups"))
        .unwrap()
        .next()
        .is_some());
}
