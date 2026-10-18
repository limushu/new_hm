use crate::{access, AppState};
use hm_core::*;
use tauri::State;
#[tauri::command(async)]
pub fn save_work_event(
    state: State<'_, AppState>,
    input: CalendarEvent,
    proceeding_id: Option<String>,
    stage_id: Option<String>,
) -> std::result::Result<(), String> {
    access(&state, |s| {
        s.save_work_event(input, proceeding_id, stage_id)
    })
}
#[tauri::command(async)]
pub fn save_work_record(
    state: State<'_, AppState>,
    input: RecordInput,
    proceeding_id: Option<String>,
    stage_id: Option<String>,
) -> std::result::Result<(), String> {
    access(&state, |s| {
        s.save_work_record(input, proceeding_id, stage_id)
    })
}
#[tauri::command(async)]
pub fn save_work_ledger(
    state: State<'_, AppState>,
    input: LedgerEntry,
    stage_id: Option<String>,
    source_path: Option<std::path::PathBuf>,
    receipt_id: Option<String>,
) -> std::result::Result<(), String> {
    access(&state, |s| {
        s.save_work_ledger(
            input,
            stage_id,
            source_path.as_deref(),
            receipt_id.as_deref(),
        )
    })
}
#[tauri::command(async)]
pub fn save_work_link(
    state: State<'_, AppState>,
    input: WorkLink,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_work_link(input))
}
#[tauri::command(async)]
pub fn delete_work_link(state: State<'_, AppState>, id: String) -> std::result::Result<(), String> {
    access(&state, |s| s.delete_work_link(&id))
}
#[tauri::command(async)]
pub fn save_work_task(
    state: State<'_, AppState>,
    input: SaveWorkTask,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_work_task(input))
}
#[tauri::command(async)]
pub fn apply_stage_tasks(
    state: State<'_, AppState>,
    stage_id: String,
    titles: Vec<String>,
) -> std::result::Result<(), String> {
    access(&state, |s| s.apply_stage_tasks(&stage_id, titles))
}
#[tauri::command(async)]
pub fn save_fee_plan(
    state: State<'_, AppState>,
    input: FeePlan,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_fee_plan(input))
}
#[tauri::command(async)]
pub fn delete_fee_plan(state: State<'_, AppState>, id: String) -> std::result::Result<(), String> {
    access(&state, |s| s.delete_fee_plan(&id))
}
#[tauri::command(async)]
pub fn save_fee_allocation(
    state: State<'_, AppState>,
    input: FeeAllocation,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_fee_allocation(input))
}
#[tauri::command(async)]
pub fn save_fee_agreement(
    state: State<'_, AppState>,
    case_id: String,
    amount_cents: i64,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_fee_agreement(&case_id, amount_cents))
}
#[tauri::command(async)]
pub fn save_workflow_template(
    state: State<'_, AppState>,
    input: WorkflowTemplate,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_workflow_template(input))
}
#[tauri::command(async)]
pub fn delete_workflow_template(
    state: State<'_, AppState>,
    id: String,
) -> std::result::Result<(), String> {
    access(&state, |s| s.delete_workflow_template(&id))
}
#[tauri::command(async)]
pub fn rename_proceeding(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> std::result::Result<(), String> {
    access(&state, |s| s.rename_proceeding(&id, &name))
}
#[tauri::command(async)]
pub fn save_case_party(
    state: State<'_, AppState>,
    input: SaveCaseParty,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_case_party(input))
}
#[tauri::command(async)]
pub fn delete_case_party(
    state: State<'_, AppState>,
    id: String,
) -> std::result::Result<(), String> {
    access(&state, |s| s.delete_case_party(&id))
}
#[tauri::command(async)]
pub fn update_proceeding_meta(
    state: State<'_, AppState>,
    input: ProceedingMeta,
) -> std::result::Result<(), String> {
    access(&state, |s| s.update_proceeding_meta(input))
}

#[tauri::command(async)]
pub fn create_material_folder(
    state: State<'_, AppState>,
    target: MaterialTarget,
    name: String,
) -> std::result::Result<String, String> {
    access(&state, |s| s.create_material_folder(target, &name))
}

#[tauri::command(async)]
pub fn rename_material(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> std::result::Result<(), String> {
    access(&state, |s| s.rename_material(&id, &name))
}

#[tauri::command(async)]
pub fn update_material_notes(
    state: State<'_, AppState>,
    id: String,
    notes: String,
) -> std::result::Result<(), String> {
    access(&state, |s| s.update_material_notes(&id, &notes))
}

#[tauri::command(async)]
pub fn move_material(
    state: State<'_, AppState>,
    id: String,
    target: MaterialTarget,
) -> std::result::Result<(), String> {
    access(&state, |s| s.move_material(&id, target))
}

#[tauri::command(async)]
pub fn save_contact(
    state: State<'_, AppState>,
    input: Contact,
    court_ids: Option<Vec<String>>,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_contact_with_courts(input, court_ids))
}
#[tauri::command(async)]
pub fn set_proceeding_contacts(
    state: State<'_, AppState>,
    input: ProceedingContacts,
) -> std::result::Result<(), String> {
    access(&state, |s| s.set_proceeding_contacts(input))
}

#[tauri::command(async)]
pub fn save_contact_link(
    state: State<'_, AppState>,
    input: ContactLink,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_contact_link(input))
}

#[tauri::command(async)]
pub fn delete_contact(state: State<'_, AppState>, id: String) -> std::result::Result<(), String> {
    access(&state, |s| s.delete_contact(&id))
}

#[tauri::command(async)]
pub fn delete_contact_link(
    state: State<'_, AppState>,
    id: String,
) -> std::result::Result<(), String> {
    access(&state, |s| s.delete_contact_link(&id))
}

#[tauri::command(async)]
pub fn save_ledger(
    state: State<'_, AppState>,
    input: LedgerEntry,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_ledger(input))
}

#[tauri::command(async)]
pub fn delete_ledger(state: State<'_, AppState>, id: String) -> std::result::Result<(), String> {
    access(&state, |s| s.delete_ledger(&id))
}

#[tauri::command(async)]
pub fn save_case_detail(
    state: State<'_, AppState>,
    input: CaseDetail,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_case_detail(input))
}

#[tauri::command(async)]
pub fn save_stage(state: State<'_, AppState>, input: Stage) -> std::result::Result<(), String> {
    access(&state, |s| s.save_stage(input))
}

#[tauri::command(async)]
pub fn reorder_stages(
    state: State<'_, AppState>,
    proceeding_id: String,
    ids: Vec<String>,
) -> std::result::Result<(), String> {
    access(&state, |s| s.reorder_stages(&proceeding_id, &ids))
}

#[tauri::command(async)]
pub fn delete_stage(state: State<'_, AppState>, id: String) -> std::result::Result<(), String> {
    access(&state, |s| s.delete_stage(&id))
}

#[tauri::command(async)]
pub fn save_case_event(
    state: State<'_, AppState>,
    input: CaseEvent,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_case_event(input))
}

#[tauri::command(async)]
pub fn save_record(
    state: State<'_, AppState>,
    input: RecordInput,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_record(input))
}

#[tauri::command(async)]
pub fn trash_item(
    state: State<'_, AppState>,
    kind: String,
    id: String,
) -> std::result::Result<(), String> {
    access(&state, |s| s.trash_item(&kind, &id))
}

#[tauri::command(async)]
pub fn restore_item(
    state: State<'_, AppState>,
    kind: String,
    id: String,
) -> std::result::Result<(), String> {
    access(&state, |s| s.restore_item(&kind, &id))
}

#[tauri::command(async)]
pub fn purge_item(
    state: State<'_, AppState>,
    kind: String,
    id: String,
    confirmed: bool,
) -> std::result::Result<(), String> {
    access(&state, |s| s.purge_item(&kind, &id, confirmed))
}

#[tauri::command(async)]
pub fn save_case_status(
    state: State<'_, AppState>,
    input: CaseStatus,
) -> std::result::Result<(), String> {
    access(&state, |s| s.save_case_status(input))
}

#[tauri::command(async)]
pub fn delete_case_status(
    state: State<'_, AppState>,
    id: String,
) -> std::result::Result<(), String> {
    access(&state, |s| s.delete_case_status(&id))
}

#[tauri::command(async)]
pub fn get_settings(
    state: State<'_, AppState>,
) -> std::result::Result<std::collections::BTreeMap<String, String>, String> {
    access(&state, |s| s.settings())
}

#[tauri::command(async)]
pub fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> std::result::Result<(), String> {
    access(&state, |s| s.set_setting(&key, &value))
}

#[tauri::command(async)]
pub fn due_reminders(state: State<'_, AppState>) -> std::result::Result<Vec<Reminder>, String> {
    access(&state, |s| {
        s.due_reminders(chrono::Local::now().naive_local())
    })
}

#[tauri::command(async)]
pub fn acknowledge_reminder(
    state: State<'_, AppState>,
    event_id: String,
    key: String,
) -> std::result::Result<(), String> {
    access(&state, |s| s.acknowledge_reminder(&event_id, &key))
}

#[tauri::command(async)]
pub fn seed_example(state: State<'_, AppState>, id: String) -> std::result::Result<String, String> {
    access(&state, |s| s.seed_example(&id))
}
