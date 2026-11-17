mod ipc;
mod platforms;
mod subsystems;
use hm_application::workspace::WorkspaceCell;
use hm_core::{
    AddTask, CalendarEvent, Case, CaseHeader, CreateCase, StorageLocation, Store, UpdateCase,
    UpdateProceeding, Workspace,
};
use tauri::{Manager, State};

pub(crate) struct AppState(WorkspaceCell);
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
fn update_case(state: State<'_, AppState>, input: UpdateCase) -> Result<CaseHeader, String> {
    access(&state, |s| {
        let id = input.id.clone();
        s.update_case(input)?;
        s.case_header(&id)
    })
}
#[tauri::command(async)]
fn set_case_status(
    state: State<'_, AppState>,
    id: String,
    status_id: String,
) -> Result<CaseHeader, String> {
    access(&state, |s| {
        s.set_case_status(&id, &status_id)?;
        s.case_header(&id)
    })
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
            let changes = app.handle().clone();
            app.manage(AppState(WorkspaceCell::new(store, move || {
                subsystems::agenda::changed(&changes)
            })));
            app.manage(hm_application::case_system::CaseSystem::default());
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
            ipc::case_system::save_resource_metadata,
            ipc::case_system::save_object_property,
            ipc::case_system::delete_object_property,
            ipc::case_system::apply_object_properties,
            ipc::case_system::save_resource_relation,
            ipc::case_system::save_resource_relations,
            ipc::case_system::delete_resource_relation,
            subsystems::subsystem_manifest,
            subsystems::agenda::agenda_status,
            subsystems::agenda::agenda_refresh,
            subsystems::agenda::agenda_request_notifications,
            subsystems::agenda::agenda_notification_settings,
            subsystems::agenda::agenda_calendar_targets,
            subsystems::agenda::agenda_calendar_link,
            subsystems::agenda::agenda_calendar_attach,
            subsystems::agenda::agenda_calendar_detach,
            subsystems::recording::native_recording_support,
            subsystems::recording::start_native_recording,
            subsystems::recording::pause_native_recording,
            subsystems::recording::resume_native_recording,
            subsystems::recording::finish_native_recording,
            subsystems::recording::cancel_native_recording,
            subsystems::recording::native_recording_state,
            subsystems::recording::archive_native_recording,
            subsystems::speech::speech_support,
            subsystems::speech::start_transcription,
            subsystems::speech::transcription_state,
            subsystems::speech::cancel_transcription,
            subsystems::speech::discard_transcription,
            subsystems::speech::save_transcription,
            ipc::host::set_window_theme,
            #[cfg(mobile)]
            subsystems::mobile::resume_runtime,
            load_workspace,
            ipc::workspace::save_work_link,
            ipc::workspace::save_work_event,
            ipc::workspace::save_work_record,
            ipc::workspace::save_work_ledger,
            ipc::workspace::delete_work_link,
            ipc::workspace::save_work_task,
            ipc::workspace::apply_stage_tasks,
            ipc::workspace::save_fee_plan,
            ipc::workspace::delete_fee_plan,
            ipc::workspace::save_fee_allocation,
            ipc::workspace::save_fee_agreement,
            subsystems::documents::pick_receipt_file,
            subsystems::documents::save_ledger_with_receipt,
            storage_info,
            save_calendar_event,
            delete_calendar_event,
            create_case,
            update_case,
            set_case_status,
            add_proceeding,
            ipc::workspace::save_workflow_template,
            ipc::workspace::delete_workflow_template,
            ipc::workspace::rename_proceeding,
            ipc::workspace::save_case_party,
            ipc::workspace::delete_case_party,
            select_proceeding,
            update_proceeding,
            add_task,
            toggle_task,
            add_record,
            trash_case,
            restore_case,
            ipc::workspace::seed_example,
            ipc::workspace::create_material_folder,
            ipc::workspace::rename_material,
            ipc::workspace::update_material_notes,
            ipc::workspace::move_material,
            ipc::workspace::save_contact,
            ipc::workspace::update_proceeding_meta,
            ipc::workspace::set_proceeding_contacts,
            ipc::workspace::save_contact_link,
            ipc::workspace::delete_contact,
            ipc::workspace::delete_contact_link,
            ipc::workspace::save_ledger,
            ipc::workspace::delete_ledger,
            ipc::workspace::save_case_detail,
            ipc::workspace::save_stage,
            ipc::workspace::reorder_stages,
            ipc::workspace::delete_stage,
            ipc::workspace::save_case_event,
            ipc::workspace::save_record,
            ipc::workspace::trash_item,
            ipc::workspace::restore_item,
            ipc::workspace::purge_item,
            ipc::workspace::save_case_status,
            ipc::workspace::delete_case_status,
            ipc::workspace::get_settings,
            ipc::workspace::set_setting,
            ipc::workspace::due_reminders,
            ipc::workspace::acknowledge_reminder,
            subsystems::documents::pick_materials,
            subsystems::documents::import_material_paths,
            subsystems::documents::material_preview,
            subsystems::documents::open_material,
            subsystems::documents::export_material,
            subsystems::recording::save_recording,
            subsystems::documents::create_text_document,
            subsystems::documents::read_text_document,
            subsystems::backup::choose_backup_directory,
            subsystems::backup::run_backup,
            subsystems::sync::native_sync_provider,
            subsystems::sync::sync_status,
            subsystems::sync::sync_workspaces,
            subsystems::sync::sync_enable,
            subsystems::sync::sync_disable,
            subsystems::sync::sync_presence,
            subsystems::sync::sync_tick,
            subsystems::sync::sync_apply_pending,
            subsystems::sync::sync_resolve,
            subsystems::identity::identity_status,
            subsystems::identity::identity_sign_in,
            subsystems::identity::identity_link,
            subsystems::identity::identity_unlink,
            subsystems::identity::identity_sign_out,
            subsystems::identity::identity_delete_account,
            subsystems::backup::export_backup_archive,
            subsystems::backup::pick_backup_archive,
            subsystems::backup::restore_backup_archive,
            subsystems::backup::discard_backup_archive,
            subsystems::backup::pick_restore_backup,
            subsystems::backup::apply_restore_backup,
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
