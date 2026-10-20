mod commands;
mod files;
mod subsystems;
#[cfg(windows)]
mod windows_icon;
use hm_core::{
    AddTask, CalendarEvent, Case, CreateCase, StorageLocation, Store, UpdateCase, UpdateProceeding,
    Workspace,
};
use std::sync::Mutex;
use tauri::{Manager, State};

pub(crate) struct AppState(Mutex<Store>);
pub(crate) fn access<T>(
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
    parent_id: Option<String>,
    name: Option<String>,
) -> Result<String, String> {
    access(&state, |s| {
        s.add_named_proceeding(&case_id, &kind, parent_id.as_deref(), name.as_deref())
    })
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
    #[cfg(desktop)]
    let executable = std::env::current_exe().expect("无法确定程序所在位置");
    let context = tauri::generate_context!();
    #[cfg(desktop)]
    let context = {
        let mut context = context;
        let portable =
            StorageLocation::portable_directory(&executable, cfg!(target_os = "windows")).is_some();
        if portable {
            // A portable workspace has its own data directory. Its single-instance lock
            // must not forward to an installed app (or another portable workspace).
            let root = executable.parent().unwrap_or(std::path::Path::new("."));
            let canonical = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
            let hash = canonical
                .to_string_lossy()
                .to_lowercase()
                .bytes()
                .fold(0xcbf29ce484222325u64, |hash, byte| {
                    (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3)
                });
            context.config_mut().identifier = format!("com.limushu.hm.portable.p{hash:016x}");
            // Create the window in setup so its WebView profile can follow the portable data folder.
            for window in &mut context.config_mut().app.windows {
                window.create = false;
            }
        }
        context
    };
    subsystems::configure(tauri::Builder::default())
        .setup(move |app| {
            #[cfg(desktop)]
            let location = StorageLocation::resolve(
                &executable,
                &app.path().app_local_data_dir()?,
                cfg!(target_os = "windows"),
            );
            #[cfg(mobile)]
            let location = StorageLocation::sandbox(&app.path().app_local_data_dir()?);
            let store = Store::open(&location.data_directory.join("workspace.sqlite3"))?;
            if store.setting("backup_directory")?.is_none() {
                store.set_setting(
                    "backup_directory",
                    &location.data_directory.join("backups").to_string_lossy(),
                )?;
            }
            app.manage(AppState(Mutex::new(store)));
            app.manage(location.clone());
            #[cfg(target_os = "windows")]
            if location.portable {
                let config = app.config().app.windows.first().ok_or("缺少主窗口配置")?;
                tauri::WebviewWindowBuilder::from_config(app, config)?
                    .data_directory(location.data_directory.join("webview"))
                    .title("案笺 · 绿色版")
                    .build()?;
            }
            subsystems::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            subsystems::subsystem_manifest,
            #[cfg(mobile)]
            subsystems::mobile::resume_runtime,
            load_workspace,
            commands::save_work_link,
            commands::save_work_event,
            commands::save_work_record,
            commands::save_work_ledger,
            commands::delete_work_link,
            commands::save_work_task,
            commands::apply_stage_tasks,
            commands::save_fee_plan,
            commands::delete_fee_plan,
            commands::save_fee_allocation,
            commands::save_fee_agreement,
            #[cfg(desktop)]
            files::pick_receipt_file,
            #[cfg(desktop)]
            files::save_ledger_with_receipt,
            storage_info,
            save_calendar_event,
            delete_calendar_event,
            create_case,
            update_case,
            set_case_status,
            add_proceeding,
            commands::save_workflow_template,
            commands::delete_workflow_template,
            commands::rename_proceeding,
            commands::save_case_party,
            commands::delete_case_party,
            select_proceeding,
            update_proceeding,
            add_task,
            toggle_task,
            add_record,
            trash_case,
            restore_case,
            commands::seed_example,
            commands::create_material_folder,
            commands::rename_material,
            commands::update_material_notes,
            commands::move_material,
            commands::save_contact,
            commands::update_proceeding_meta,
            commands::set_proceeding_contacts,
            commands::save_contact_link,
            commands::delete_contact,
            commands::delete_contact_link,
            commands::save_ledger,
            commands::delete_ledger,
            commands::save_case_detail,
            commands::save_stage,
            commands::reorder_stages,
            commands::delete_stage,
            commands::save_case_event,
            commands::save_record,
            commands::trash_item,
            commands::restore_item,
            commands::purge_item,
            commands::save_case_status,
            commands::delete_case_status,
            commands::get_settings,
            commands::set_setting,
            commands::due_reminders,
            commands::acknowledge_reminder,
            #[cfg(desktop)]
            files::pick_materials,
            #[cfg(desktop)]
            files::import_material_paths,
            files::material_preview,
            #[cfg(desktop)]
            files::open_material,
            #[cfg(desktop)]
            files::export_material,
            #[cfg(desktop)]
            files::save_recording,
            #[cfg(desktop)]
            files::choose_backup_directory,
            files::run_backup,
            #[cfg(desktop)]
            files::pick_restore_backup,
            #[cfg(desktop)]
            files::apply_restore_backup,
            subsystems::maintenance::background_status,
            #[cfg(desktop)]
            subsystems::host::quit_app,
            #[cfg(desktop)]
            subsystems::host::autostart_status,
            #[cfg(desktop)]
            subsystems::host::set_autostart,
            #[cfg(desktop)]
            subsystems::updates::check_update,
            #[cfg(desktop)]
            subsystems::updates::get_update_status,
            #[cfg(desktop)]
            subsystems::updates::install_update,
        ])
        .build(context)
        .expect("应用启动失败")
        .run(|app, event| match event {
            tauri::RunEvent::Exit => subsystems::shutdown(app),
            #[cfg(mobile)]
            tauri::RunEvent::Ready | tauri::RunEvent::Resumed => subsystems::mobile::resume(app),
            _ => {}
        });
}
