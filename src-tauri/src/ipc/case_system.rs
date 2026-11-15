use crate::{access, AppState};
use hm_application::case_system::CaseSystem;
use hm_core::case_system::{ResourceMetadata, ResourceRelation};
use tauri::State;

#[tauri::command(async)]
pub fn save_resource_metadata(
    state: State<'_, AppState>,
    system: State<'_, CaseSystem>,
    input: ResourceMetadata,
) -> Result<(), String> {
    access(&state, |store| system.annotate(store, input))
}

#[tauri::command(async)]
pub fn save_resource_relation(
    state: State<'_, AppState>,
    system: State<'_, CaseSystem>,
    input: ResourceRelation,
) -> Result<(), String> {
    access(&state, |store| system.relate(store, input))
}

#[tauri::command(async)]
pub fn delete_resource_relation(
    state: State<'_, AppState>,
    case_id: String,
    id: String,
) -> Result<(), String> {
    access(&state, |store| {
        store.delete_resource_relation(&case_id, &id)
    })
}
