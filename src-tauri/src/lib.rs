use hm_core::{AddTask, Case, CreateCase, Store, UpdateCase, UpdateProceeding, Workspace};
use std::sync::Mutex;
use tauri::{Manager, State};

struct AppState(Mutex<Store>);
fn access<T>(
    state: &AppState,
    action: impl FnOnce(&mut Store) -> hm_core::Result<T>,
) -> Result<T, String> {
    let mut store = state
        .0
        .lock()
        .map_err(|_| "数据库暂时不可用，请重新启动应用".to_string())?;
    action(&mut store).map_err(|e| e.to_string())
}
#[tauri::command(async)]
fn load_workspace(state: State<'_, AppState>) -> Result<Workspace, String> {
    access(&state, |s| s.workspace())
}
#[tauri::command(async)]
fn create_case(state: State<'_, AppState>, input: CreateCase) -> Result<Case, String> {
    access(&state, |s| s.create_case(input))
}
#[tauri::command(async)]
fn update_case(state: State<'_, AppState>, input: UpdateCase) -> Result<(), String> {
    access(&state, |s| s.update_case(input))
}
#[tauri::command(async)]
fn add_proceeding(
    state: State<'_, AppState>,
    case_id: String,
    kind: String,
) -> Result<String, String> {
    access(&state, |s| s.add_proceeding(&case_id, &kind))
}
#[tauri::command(async)]
fn select_proceeding(
    state: State<'_, AppState>,
    case_id: String,
    proceeding_id: String,
) -> Result<(), String> {
    access(&state, |s| s.select_proceeding(&case_id, &proceeding_id))
}
#[tauri::command(async)]
fn update_proceeding(state: State<'_, AppState>, input: UpdateProceeding) -> Result<(), String> {
    access(&state, |s| s.update_proceeding(input))
}
#[tauri::command(async)]
fn add_task(state: State<'_, AppState>, input: AddTask) -> Result<String, String> {
    access(&state, |s| s.add_task(input))
}
#[tauri::command(async)]
fn toggle_task(state: State<'_, AppState>, id: String, completed: bool) -> Result<(), String> {
    access(&state, |s| s.toggle_task(&id, completed))
}
#[tauri::command(async)]
fn add_record(state: State<'_, AppState>, case_id: String, body: String) -> Result<String, String> {
    access(&state, |s| s.add_record(&case_id, &body))
}
#[tauri::command(async)]
fn trash_case(state: State<'_, AppState>, id: String) -> Result<(), String> {
    access(&state, |s| s.trash_case(&id))
}
#[tauri::command(async)]
fn restore_case(state: State<'_, AppState>, id: String) -> Result<(), String> {
    access(&state, |s| s.restore_case(&id))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_local_data_dir()?;
            let store = Store::open(&directory.join("workspace.sqlite3"))?;
            app.manage(AppState(Mutex::new(store)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            create_case,
            update_case,
            add_proceeding,
            select_proceeding,
            update_proceeding,
            add_task,
            toggle_task,
            add_record,
            trash_case,
            restore_case
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
