//! CI-only fictional workspace created by the host's bundled SQLite build.
use hm_core::{CreateCase, MaterialTarget, Store};
use std::{io::Cursor, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::args().nth(1).ok_or("missing fixture directory")?);
    let edition = std::env::args().nth(2).ok_or("missing welcome edition")?;
    std::fs::create_dir_all(&root)?;
    if std::fs::read_dir(&root)?.next().is_some() {
        return Err("fixture destination must be empty".into());
    }
    let mut store = Store::open(&root.join("workspace.sqlite3"))?;
    let case = store.create_case(CreateCase {
        id: "8e3b7b52-843e-4c6b-a893-1e774b441a09".into(),
        title: "SQLite upgrade fixture (fictional)".into(),
        case_type: "other".into(),
        status_id: "in_progress".into(),
        tags: None,
    })?;
    let target = MaterialTarget {
        case_id: case.id,
        proceeding_id: None,
        stage_id: None,
        parent_id: None,
        record_id: None,
    };
    let material = store.import_reader(
        &target,
        "upgrade-proof.txt",
        &mut Cursor::new(b"bundled-to-system-sqlite-fixture"),
    )?;
    store.set_setting("onboarding_done", &edition)?;
    println!(
        "{}",
        serde_json::json!({"sourceSqlite": rusqlite::version(), "schema": 9, "materialId": material})
    );
    Ok(())
}
