use hm_core::{
    AddTask, CalendarEvent, Case, CreateCase, StorageLocation, Store, UpdateCase, UpdateProceeding,
    Workspace,
};
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
fn storage_info(location: State<'_, StorageLocation>) -> StorageLocation {
    location.inner().clone()
}
#[tauri::command(async)]
fn save_calendar_event(state: State<'_, AppState>, input: CalendarEvent) -> Result<(), String> {
    access(&state, |s| s.save_calendar_event(input))
}
#[tauri::command(async)]
fn delete_calendar_event(state: State<'_, AppState>, id: String) -> Result<(), String> {
    access(&state, |s| s.delete_calendar_event(&id))
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
fn set_case_status(
    state: State<'_, AppState>,
    id: String,
    status_id: String,
) -> Result<(), String> {
    access(&state, |s| s.set_case_status(&id, &status_id))
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
    let executable = std::env::current_exe().expect("无法确定程序所在位置");
    let mut context = tauri::generate_context!();
    let portable =
        StorageLocation::portable_directory(&executable, cfg!(target_os = "windows")).is_some();
    if portable {
        // Create the window in setup so its WebView profile can follow the portable data folder.
        for window in &mut context.config_mut().app.windows {
            window.create = false;
        }
    }
    tauri::Builder::default()
        .setup(move |app| {
            let location = StorageLocation::resolve(
                &executable,
                &app.path().app_local_data_dir()?,
                cfg!(target_os = "windows"),
            );
            let store = Store::open(&location.data_directory.join("workspace.sqlite3"))?;
            app.manage(AppState(Mutex::new(store)));
            app.manage(location.clone());
            #[cfg(target_os = "windows")]
            if location.portable {
                let config = app.config().app.windows.first().ok_or("缺少主窗口配置")?;
                tauri::WebviewWindowBuilder::from_config(app, config)?
                    .data_directory(location.data_directory.join("webview"))
                    .title("律师工作台 · 绿色版")
                    .build()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            storage_info,
            save_calendar_event,
            delete_calendar_event,
            create_case,
            update_case,
            set_case_status,
            add_proceeding,
            select_proceeding,
            update_proceeding,
            add_task,
            toggle_task,
            add_record,
            trash_case,
            restore_case
        ])
        .run(context)
        .expect("应用启动失败");
}
