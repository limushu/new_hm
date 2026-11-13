//! Fictional App Store screenshots only; never opens an existing workspace.
use hm_core::{AddTask, CalendarEvent, CreateCase, Store};
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::args().nth(1).ok_or("missing fixture directory")?);
    let date = std::env::args().nth(2).ok_or("missing screenshot date")?;
    std::fs::create_dir_all(&root)?;
    if std::fs::read_dir(&root)?.next().is_some() {
        return Err("fixture destination must be empty".into());
    }
    let mut store = Store::open(&root.join("workspace.sqlite3"))?;
    let case_id = store.seed_example("8e3b7b52-843e-4c6b-a893-1e774b441a09")?;
    for (id, title, status) in [
        (
            "4f6ce94c-d942-420d-86c1-602e8c6d15a9",
            "示例 · 劳动合同纠纷",
            "not_started",
        ),
        (
            "908286f2-f297-4d9e-97db-44f47dfab92e",
            "示例 · 房屋租赁纠纷",
            "closed",
        ),
    ] {
        store.create_case(CreateCase {
            id: id.into(),
            title: title.into(),
            case_type: "civil".into(),
            status_id: status.into(),
            tags: None,
        })?;
    }
    store.add_task(AddTask {
        case_id: case_id.clone(),
        title: "整理示例证据目录".into(),
        due_date: Some(date.clone()),
    })?;
    store.save_calendar_event(CalendarEvent {
        id: "516159f1-e994-4136-9777-31a3a9f9964b".into(),
        title: "示例 · 材料核对".into(),
        start_date: date.clone(),
        end_date: date,
        start_time: None,
        end_time: None,
        case_id: Some(case_id),
        location: "虚构演示日程".into(),
        notes: "所有截图内容均为虚构，不含真实案件或个人信息。".into(),
        reminder_minutes: None,
    })?;
    store.set_setting("onboarding_done", "hm-welcome-1")?;
    println!("{}", serde_json::json!({"fictional": true, "cases": 3}));
    Ok(())
}
