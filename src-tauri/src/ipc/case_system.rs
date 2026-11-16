use crate::{access, AppState};
use hm_application::case_system::CaseSystem;
use hm_core::case_system::{ResourceMetadata, ResourceRelation};
use tauri::State;

#[tauri::command(async)]
pub fn save_resource_relations(
    state: State<'_, AppState>,
    system: State<'_, CaseSystem>,
    inputs: Vec<ResourceRelation>,
) -> Result<(), String> {
    access(&state, |store| system.relate_many(store, inputs))
}

#[tauri::command(async)]
pub fn save_object_property(
    state: State<'_, AppState>,
    system: State<'_, CaseSystem>,
    input: hm_core::case_system::ObjectPropertyInput,
) -> Result<(), String> {
    access(&state, |store| system.save_property(store, input))
}
#[tauri::command(async)]
pub fn delete_object_property(
    state: State<'_, AppState>,
    system: State<'_, CaseSystem>,
    case_id: String,
    resource: hm_core::case_system::ResourceRef,
    id: String,
) -> Result<(), String> {
    access(&state, |store| {
        system.delete_property(store, &case_id, &resource, &id)
    })
}

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

#[tauri::command(async)]
pub fn apply_object_properties(
    state: State<'_, AppState>,
    system: State<'_, CaseSystem>,
    input: hm_core::case_system::ApplyObjectProperties,
) -> Result<(), String> {
    access(&state, |store| system.apply_properties(store, input))
}
