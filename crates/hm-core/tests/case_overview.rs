use hm_core::*;
use uuid::Uuid;
fn create(s: &mut Store, tags: Option<Vec<String>>) -> Case {
    s.create_case(CreateCase {
        id: Uuid::new_v4().to_string(),
        title: "案件全貌验收（虚构）".into(),
        case_type: "civil".into(),
        status_id: "in_progress".into(),
        tags,
    })
    .unwrap()
}
#[test]
fn parallel_programs_have_explicit_links_and_focus_without_closing_other_programs() {
    let mut s = Store::memory().unwrap();
    let case = create(&mut s, None);
    let other = create(&mut s, None);
    let first = case.current_proceeding_id.unwrap();
    let appeal = s
        .add_proceeding_from(&case.id, "appeal", Some(&first))
        .unwrap();
    let enforcement = s
        .add_proceeding_from(&case.id, "enforcement", Some(&first))
        .unwrap();
    let retrial = s
        .add_proceeding_from(&case.id, "retrial", Some(&appeal))
        .unwrap();
    assert!(s
        .add_proceeding_from(&case.id, "appeal", other.current_proceeding_id.as_deref())
        .is_err());
    assert!(s
        .update_proceeding_meta(ProceedingMeta {
            id: first.clone(),
            parent_id: Some(retrial),
            state: "active".into()
        })
        .is_err());
    assert!(s
        .update_proceeding_meta(ProceedingMeta {
            id: first.clone(),
            parent_id: Some(first.clone()),
            state: "active".into()
        })
        .is_err());
    s.select_proceeding(&case.id, &appeal).unwrap();
    s.update_proceeding_meta(ProceedingMeta {
        id: appeal.clone(),
        parent_id: Some(first.clone()),
        state: "completed".into(),
    })
    .unwrap();
    let w = s.workspace().unwrap();
    let current = w.cases.iter().find(|c| c.id == case.id).unwrap();
    assert_eq!(current.status_id, "in_progress");
    assert!(current.current_proceeding_id.is_none());
    assert_eq!(
        w.proceedings
            .iter()
            .filter(|p| p.case_id == case.id && p.state == "active")
            .count(),
        3
    );
    assert!(s.select_proceeding(&case.id, &appeal).is_err());
    let ids: Vec<String> = w
        .stages
        .iter()
        .filter(|p| p.proceeding_id == appeal)
        .map(|p| p.id.clone())
        .collect();
    assert!(s.reorder_stages(&appeal, &ids).is_err());
    assert!(s.delete_stage(ids.last().unwrap()).is_err());
    let stage = w
        .stages
        .into_iter()
        .find(|s| s.proceeding_id == appeal)
        .unwrap();
    assert!(s
        .save_stage(Stage {
            state: "current".into(),
            ..stage
        })
        .is_err());
    s.select_proceeding(&case.id, &enforcement).unwrap();
    s.update_proceeding_meta(ProceedingMeta {
        id: appeal.clone(),
        parent_id: Some(first),
        state: "active".into(),
    })
    .unwrap();
    assert_eq!(
        s.workspace()
            .unwrap()
            .cases
            .iter()
            .find(|c| c.id == case.id)
            .unwrap()
            .current_proceeding_id
            .as_deref(),
        Some(enforcement.as_str())
    );
    assert!(s
        .workspace()
        .unwrap()
        .proceedings
        .iter()
        .find(|p| p.id == appeal)
        .unwrap()
        .completed_at
        .is_none());
}
#[test]
fn tags_survive_reopening_and_case_purge_while_invalid_updates_are_atomic() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workspace.sqlite3");
    let mut s = Store::open(&path).unwrap();
    let c = create(
        &mut s,
        Some(vec![
            "#合同纠纷".into(),
            "PERSONAL/劳动".into(),
            "合同纠纷".into(),
        ]),
    );
    assert_eq!(
        s.workspace().unwrap().tag_catalog,
        vec!["personal/劳动", "合同纠纷"]
    );
    assert_eq!(s.workspace().unwrap().case_tags.len(), 2);
    assert!(s
        .update_case(UpdateCase {
            id: c.id.clone(),
            title: "不应保存".into(),
            case_type: "civil".into(),
            status_id: "in_progress".into(),
            tags: Some(vec!["非法 空格".into()])
        })
        .is_err());
    assert_eq!(s.workspace().unwrap().cases[0].title, c.title);
    s.trash_case(&c.id).unwrap();
    s.purge_item("case", &c.id, true).unwrap();
    drop(s);
    let s = Store::open(&path).unwrap();
    let w = s.workspace().unwrap();
    assert!(w.case_tags.is_empty());
    assert_eq!(w.tag_catalog.len(), 2);
}
#[test]
fn v4_migration_preserves_programs_and_text_and_does_not_invent_a_linear_history() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workspace.sqlite3");
    let db = rusqlite::Connection::open(&path).unwrap();
    for sql in [
        include_str!("../migrations/001_initial.sql"),
        include_str!("../migrations/002_calendar_events.sql"),
        include_str!("../migrations/003_v1_workspace.sql"),
        include_str!("../migrations/004_contact_relations.sql"),
    ] {
        db.execute_batch(sql).unwrap();
    }
    let case = Uuid::new_v4().to_string();
    let p = Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO cases(id,title,case_type,status_id) VALUES(?1,'原案件','civil','in_progress')",
        [&case],
    )
    .unwrap();
    db.execute(
        "INSERT INTO proceedings(id,case_id,kind,court) VALUES(?1,?2,'appeal','历史法院')",
        [&p, &case],
    )
    .unwrap();
    db.execute("INSERT INTO case_events(id,case_id,title,event_date) VALUES(?1,?2,'切换阶段：开庭','2026-10-18')",[Uuid::new_v4().to_string(),case.clone()]).unwrap();
    drop(db);
    let s = Store::open(&path).unwrap();
    let w = s.workspace().unwrap();
    assert_eq!(w.proceedings.len(), 1);
    assert!(w.proceedings[0].parent_id.is_none());
    assert_eq!(w.proceedings[0].court, "历史法院");
    assert_eq!(w.case_events[0].kind, "stage_change");
    assert_eq!(w.case_tags[0].tag, "民商事诉讼");
    assert!(w.contacts.is_empty());
    let before = std::fs::read_dir(root.path().join("migration-backups"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let db = rusqlite::Connection::open(before).unwrap();
    assert_eq!(
        db.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        4
    );
}
#[test]
fn update_sources_allow_https_without_credentials_and_reject_unsafe_urls() {
    let s = Store::memory().unwrap();
    s.set_setting("update_endpoint", "https://updates.example.org/latest.json")
        .unwrap();
    for bad in [
        "http://example.org/x",
        "file:///tmp/x",
        "https://user:secret@example.org/x",
        "https://example.org/x#fragment",
        "javascript:alert(1)",
    ] {
        assert!(s.set_setting("update_endpoint", bad).is_err());
    }
    assert_eq!(
        s.setting("update_endpoint").unwrap().unwrap(),
        "https://updates.example.org/latest.json"
    );
    s.set_setting("update_endpoint", "").unwrap();
}

#[test]
fn stages_can_reopen_in_the_middle_without_resetting_other_work_or_erasing_history() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workspace.sqlite3");
    let mut store = Store::open(&path).unwrap();
    let case = create(&mut store, None);
    let program = case.current_proceeding_id.as_ref().unwrap();
    let stages = store.stages().unwrap();
    let mut middle = stages[1].clone();
    let mut current = stages[2].clone();
    current.state = "current".into();
    store.save_stage(current.clone()).unwrap();
    assert_eq!(store.stages().unwrap()[0].state, "pending");
    middle.state = "done".into();
    store.save_stage(middle.clone()).unwrap();
    let mut later = stages[4].clone();
    later.state = "done".into();
    store.save_stage(later.clone()).unwrap();
    middle.state = "pending".into();
    store.save_stage(middle.clone()).unwrap();
    let rows = store.stages().unwrap();
    assert_eq!(rows[1].state, "pending");
    assert_eq!(rows[2].state, "current");
    assert_eq!(rows[4].state, "done");
    let history = store.case_events().unwrap();
    assert!(history[0].title.contains("重新打开阶段"));
    assert_eq!(history[0].notes, "已完成 → 待办理");
    assert!(history.iter().any(|e| e.title.contains("完成阶段")));
    store.save_stage(middle.clone()).unwrap();
    assert_eq!(store.case_events().unwrap().len(), history.len());
    middle.state = "current".into();
    store.save_stage(middle.clone()).unwrap();
    assert_eq!(store.stages().unwrap()[2].state, "pending");
    assert_eq!(store.stages().unwrap()[4].state, "done");
    middle.state = "done".into();
    store.save_stage(middle.clone()).unwrap();
    assert!(store.stages().unwrap().iter().all(|s| s.state != "current"));
    assert!(store.workspace().unwrap().proceedings[0].stage.is_empty());
    middle.state = "current".into();
    store.save_stage(middle).unwrap();
    let newest = store.case_events().unwrap()[0].clone();
    assert!(newest.title.contains("重新办理阶段"));
    assert!(store
        .save_case_event(CaseEvent {
            kind: "milestone".into(),
            ..newest
        })
        .is_err());
    drop(store);
    let reopened = Store::open(&path).unwrap().workspace().unwrap();
    assert_eq!(reopened.stages[1].state, "current");
    assert_eq!(reopened.stages[4].state, "done");
    assert_eq!(
        reopened.cases[0].current_proceeding_id.as_ref(),
        Some(program)
    );
    assert_eq!(reopened.cases[0].status_id, "in_progress");
}

#[test]
fn deleting_any_stage_keeps_history_and_program_scope_and_can_leave_no_current_stage() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workspace.sqlite3");
    let mut store = Store::open(&path).unwrap();
    let case = create(&mut store, None);
    let program = case.current_proceeding_id.as_ref().unwrap();
    let other = store.add_proceeding(&case.id, "appeal").unwrap();
    let folder = store
        .create_material_folder(
            MaterialTarget {
                case_id: case.id.clone(),
                proceeding_id: Some(program.clone()),
                parent_id: None,
                record_id: None,
            },
            "阶段整理材料",
        )
        .unwrap();
    let rows: Vec<_> = store
        .stages()
        .unwrap()
        .into_iter()
        .filter(|s| &s.proceeding_id == program)
        .collect();
    let mut middle = rows[1].clone();
    middle.state = "done".into();
    store.save_stage(middle.clone()).unwrap();
    let history = store.case_events().unwrap();
    let event = CaseEvent {
        id: Uuid::new_v4().to_string(),
        case_id: case.id.clone(),
        proceeding_id: Some(program.clone()),
        title: "既有沟通事项".into(),
        event_date: "2026-10-18".into(),
        notes: "保留".into(),
        kind: "milestone".into(),
    };
    store.save_case_event(event.clone()).unwrap();
    store.delete_stage(&middle.id).unwrap();
    let workspace = store.workspace().unwrap();
    assert_eq!(
        workspace
            .proceedings
            .iter()
            .find(|p| &p.id == program)
            .unwrap()
            .stage,
        rows[0].name
    );
    assert!(workspace
        .stages
        .iter()
        .any(|s| s.id == rows[0].id && s.state == "current"));
    assert_eq!(workspace.case_events[0].title, "删除阶段：立案");
    assert!(workspace.case_events.iter().any(|e| e.id == history[0].id));
    assert!(workspace.case_events.iter().any(|e| e.id == event.id));
    store.delete_stage(&rows[0].id).unwrap();
    let workspace = store.workspace().unwrap();
    assert!(workspace
        .proceedings
        .iter()
        .find(|p| &p.id == program)
        .unwrap()
        .stage
        .is_empty());
    assert!(workspace
        .stages
        .iter()
        .filter(|s| &s.proceeding_id == program)
        .all(|s| s.state != "current"));
    assert_eq!(
        workspace
            .stages
            .iter()
            .filter(|s| s.proceeding_id == other)
            .count(),
        5
    );
    assert_eq!(workspace.case_events[0].title, "删除阶段：材料准备");
    assert!(workspace.case_events[0].notes.contains("当前办理已清空"));
    for (index, row) in workspace
        .stages
        .iter()
        .filter(|s| &s.proceeding_id == program)
        .enumerate()
    {
        assert_eq!(row.position, index as i64);
    }
    let count = workspace.case_events.len();
    assert!(store.delete_stage(&rows[0].id).is_err());
    assert_eq!(store.case_events().unwrap().len(), count);
    for row in rows.iter().skip(2) {
        store.delete_stage(&row.id).unwrap();
    }
    let replacement = Stage {
        id: Uuid::new_v4().to_string(),
        proceeding_id: program.clone(),
        name: "自定办理".into(),
        position: 0,
        state: "pending".into(),
    };
    store.save_stage(replacement.clone()).unwrap();
    drop(store);
    let workspace = Store::open(&path).unwrap().workspace().unwrap();
    let remaining: Vec<_> = workspace
        .stages
        .iter()
        .filter(|s| &s.proceeding_id == program)
        .collect();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, replacement.id);
    assert!(workspace
        .proceedings
        .iter()
        .find(|p| &p.id == program)
        .unwrap()
        .stage
        .is_empty());
    assert!(workspace.case_events.iter().any(|e| e.id == event.id));
    assert!(workspace
        .materials
        .iter()
        .any(|m| m.id == folder && m.proceeding_id.as_ref() == Some(program)));
}
