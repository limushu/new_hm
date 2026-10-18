use hm_core::*;
use uuid::Uuid;

fn event() -> CalendarEvent {
    CalendarEvent {
        id: Uuid::new_v4().to_string(),
        title: "会见当事人".into(),
        start_date: "2026-10-17".into(),
        end_date: "2026-10-17".into(),
        start_time: Some("09:00".into()),
        end_time: Some("10:00".into()),
        case_id: None,
        location: "会议室".into(),
        notes: "核对材料".into(),
        reminder_minutes: None,
    }
}

#[test]
fn version_one_upgrades_without_losing_existing_case_or_task() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("old.sqlite3");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch(include_str!("../migrations/001_initial.sql"))
        .unwrap();
    db.execute("INSERT INTO cases(id,title,case_type,status_id) VALUES('old','旧案件','civil','in_progress')", []).unwrap();
    db.execute(
        "INSERT INTO tasks(id,case_id,title) VALUES('task','old','已有待办')",
        [],
    )
    .unwrap();
    drop(db);
    let store = Store::open(&path).unwrap();
    let copies = std::fs::read_dir(dir.path().join("migration-backups"))
        .unwrap()
        .collect::<std::io::Result<Vec<_>>>()
        .unwrap();
    assert_eq!(copies.len(), 1);
    let original = rusqlite::Connection::open(copies[0].path()).unwrap();
    assert_eq!(
        original
            .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        original
            .query_row("SELECT title FROM cases", [], |r| r.get::<_, String>(0))
            .unwrap(),
        "旧案件"
    );
    let data = store.workspace().unwrap();
    assert_eq!(data.cases[0].title, "旧案件");
    assert_eq!(data.tasks[0].title, "已有待办");
    assert!(data.calendar_events.is_empty());
    store.save_calendar_event(event()).unwrap();
    drop(store);
    let db = rusqlite::Connection::open(path).unwrap();
    assert_eq!(
        db.query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
            .unwrap(),
        7
    );
    assert_eq!(
        db.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
            .unwrap(),
        "ok"
    );
}

#[test]
fn personal_events_persist_and_retry_edit_and_delete_are_safe() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("calendar.sqlite3");
    let mut input = event();
    {
        let store = Store::open(&path).unwrap();
        store.save_calendar_event(input.clone()).unwrap();
        store.save_calendar_event(input.clone()).unwrap();
    }
    let store = Store::open(&path).unwrap();
    assert_eq!(store.workspace().unwrap().calendar_events.len(), 1);
    input.title = "改期会见".into();
    input.start_date = "2026-10-18".into();
    input.end_date = "2026-10-18".into();
    store.save_calendar_event(input.clone()).unwrap();
    let saved = store.workspace().unwrap().calendar_events.pop().unwrap();
    assert_eq!(saved.title, "改期会见");
    assert_eq!(saved.start_date, "2026-10-18");
    assert_eq!(saved.location, "会议室");
    assert_eq!(saved.notes, "核对材料");
    assert!(saved.case_id.is_none());
    store.delete_calendar_event(&input.id).unwrap();
    assert!(store.workspace().unwrap().calendar_events.is_empty());
    assert!(store.save_calendar_event(input).is_err());
}

#[test]
fn invalid_event_ranges_and_links_leave_no_rows() {
    let store = Store::memory().unwrap();
    let mut inputs = Vec::new();
    let mut input = event();
    input.title = "  ".into();
    inputs.push(input);
    for invalid in ["2026-02-30", "2026-2-03", "2026-13-01"] {
        let mut input = event();
        input.start_date = invalid.into();
        inputs.push(input);
    }
    for invalid in ["9:00", "24:00", "12:60", ""] {
        let mut input = event();
        input.start_time = Some(invalid.into());
        inputs.push(input);
    }
    let mut input = event();
    input.end_time = Some("08:00".into());
    inputs.push(input);
    let mut input = event();
    input.end_time = Some("09:00".into());
    inputs.push(input);
    let mut input = event();
    input.end_time = None;
    inputs.push(input);
    let mut input = event();
    input.end_date = "2026-10-16".into();
    inputs.push(input);
    let mut input = event();
    input.case_id = Some("missing".into());
    inputs.push(input);
    for input in inputs {
        assert!(store.save_calendar_event(input).is_err());
    }
    assert!(store.workspace().unwrap().calendar_events.is_empty());
}

#[test]
fn all_day_cross_day_and_case_archive_keep_independent_events() {
    let mut store = Store::memory().unwrap();
    let case = store
        .create_case(CreateCase {
            tags: None,
            id: Uuid::new_v4().to_string(),
            title: "案件".into(),
            case_type: "civil".into(),
            status_id: "in_progress".into(),
        })
        .unwrap();
    let mut linked = event();
    linked.case_id = Some(case.id.clone());
    linked.start_time = Some("23:00".into());
    linked.end_date = "2026-10-18".into();
    linked.end_time = Some("00:00".into());
    store.save_calendar_event(linked.clone()).unwrap();
    let mut personal = event();
    personal.start_time = None;
    personal.end_time = None;
    personal.end_date = "2026-11-02".into();
    store.save_calendar_event(personal.clone()).unwrap();
    store.trash_case(&case.id).unwrap();
    assert!(store.save_calendar_event(linked.clone()).is_err());
    assert!(store.delete_calendar_event(&linked.id).is_err());
    assert_eq!(store.workspace().unwrap().calendar_events.len(), 2);
    store.save_calendar_event(personal).unwrap();
    store.restore_case(&case.id).unwrap();
    store.save_calendar_event(linked).unwrap();
    assert_eq!(store.workspace().unwrap().calendar_events.len(), 2);
}
