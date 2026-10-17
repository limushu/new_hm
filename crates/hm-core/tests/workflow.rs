use hm_core::*;
use uuid::Uuid;

fn create(store: &mut Store, title: &str) -> Case {
    store
        .create_case(CreateCase {
            id: Uuid::new_v4().to_string(),
            title: title.into(),
            case_type: "civil".into(),
            status_id: "not_started".into(),
        })
        .unwrap()
}
#[test]
fn reopening_keeps_cases_programs_tasks_and_records() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("data/workspace.sqlite3");
    let id;
    {
        let mut store = Store::open(&file).unwrap();
        let c = create(&mut store, "张某与李某借款纠纷");
        id = c.id.clone();
        store
            .add_task(AddTask {
                case_id: id.clone(),
                title: "核对材料".into(),
                due_date: Some("2026-10-17".into()),
            })
            .unwrap();
        store.add_record(&id, "已与当事人沟通").unwrap();
    }
    let store = Store::open(&file).unwrap();
    let data = store.workspace().unwrap();
    assert_eq!(data.cases[0].id, id);
    assert_eq!(data.proceedings.len(), 1);
    assert_eq!(data.tasks[0].title, "核对材料");
    assert_eq!(data.work_records[0].body, "已与当事人沟通");
}
#[test]
fn retries_are_idempotent_and_invalid_titles_leave_no_records() {
    let mut store = Store::memory().unwrap();
    let id = Uuid::new_v4().to_string();
    for _ in 0..2 {
        store
            .create_case(CreateCase {
                id: id.clone(),
                title: "重复提交".into(),
                case_type: "civil".into(),
                status_id: "not_started".into(),
            })
            .unwrap();
    }
    assert_eq!(store.workspace().unwrap().cases.len(), 1);
    assert_eq!(store.workspace().unwrap().proceedings.len(), 1);
    assert!(store
        .create_case(CreateCase {
            id: Uuid::new_v4().to_string(),
            title: "  \n ".into(),
            case_type: "civil".into(),
            status_id: "not_started".into()
        })
        .is_err());
    assert_eq!(store.workspace().unwrap().cases.len(), 1);
}
#[test]
fn programs_keep_history_and_cannot_be_selected_across_cases() {
    let mut store = Store::memory().unwrap();
    let first = create(&mut store, "案件一");
    let other = create(&mut store, "案件二");
    let initial = first.current_proceeding_id.unwrap();
    store
        .update_proceeding(UpdateProceeding {
            id: initial.clone(),
            stage: "庭前准备".into(),
            case_number: "一审案号".into(),
            court: "示例法院".into(),
            judge: "法官甲".into(),
        })
        .unwrap();
    let appeal = store.add_proceeding(&first.id, "appeal").unwrap();
    let data = store.workspace().unwrap();
    assert_eq!(
        data.proceedings
            .iter()
            .find(|p| p.id == initial)
            .unwrap()
            .case_number,
        "一审案号"
    );
    assert_eq!(
        data.proceedings
            .iter()
            .find(|p| p.id == appeal)
            .unwrap()
            .case_number,
        ""
    );
    assert_eq!(
        data.cases
            .iter()
            .find(|c| c.id == first.id)
            .unwrap()
            .status_id,
        "not_started"
    );
    assert!(store.select_proceeding(&other.id, &appeal).is_err());
    store.select_proceeding(&first.id, &initial).unwrap();
}
#[test]
fn trash_preserves_children_and_restore_recovers_them() {
    let mut store = Store::memory().unwrap();
    let c = create(&mut store, "可恢复案件");
    let task = store
        .add_task(AddTask {
            case_id: c.id.clone(),
            title: "待办".into(),
            due_date: None,
        })
        .unwrap();
    store.trash_case(&c.id).unwrap();
    assert!(store.workspace().unwrap().cases[0].deleted_at.is_some());
    assert!(store.toggle_task(&task, true).is_err());
    assert_eq!(store.workspace().unwrap().proceedings.len(), 1);
    store.restore_case(&c.id).unwrap();
    store.toggle_task(&task, true).unwrap();
    assert!(store.workspace().unwrap().tasks[0].completed);
}
#[test]
fn dates_statuses_and_ownership_are_validated() {
    let mut store = Store::memory().unwrap();
    let c = create(&mut store, "日期测试");
    for invalid in ["2026-02-30", "2026-2-1", "2026-13-01"] {
        assert!(store
            .add_task(AddTask {
                case_id: c.id.clone(),
                title: "期限".into(),
                due_date: Some(invalid.into())
            })
            .is_err());
    }
    assert!(store.add_record("missing", "不应写入").is_err());
    assert!(store
        .update_case(UpdateCase {
            id: c.id,
            title: "测试".into(),
            case_type: "civil".into(),
            status_id: "missing".into()
        })
        .is_err());
    assert!(store.workspace().unwrap().tasks.is_empty());
}
#[test]
fn newer_database_is_not_downgraded() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("newer.sqlite3");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch("PRAGMA user_version=99;").unwrap();
    drop(db);
    assert!(Store::open(&path).is_err());
}
