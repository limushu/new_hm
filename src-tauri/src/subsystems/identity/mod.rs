//! Account commands expose verified public state, never access/refresh tokens.
use hm_application::identity::{
    HostedIdentity, IdentityService, IdentitySnapshot, Provider, PublicIdentityConfig,
};
use hm_runtime::platform::{DriverError, IdentityDriver};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
pub struct IdentityState(Mutex<IdentityService>);
pub fn setup(
    app: &tauri::App,
    driver: Box<dyn IdentityDriver>,
) -> Result<(), Box<dyn std::error::Error>> {
    let config: PublicIdentityConfig =
        serde_json::from_str(include_str!("../../../../supabase/client.public.json"))?;
    app.manage(IdentityState(Mutex::new(IdentityService::new(
        driver,
        Box::new(HostedIdentity::new(config)?),
    ))));
    Ok(())
}
async fn run<T: Send + 'static>(
    app: AppHandle,
    action: impl FnOnce(&IdentityService) -> Result<T, DriverError> + Send + 'static,
) -> Result<T, DriverError> {
    // Blocking HTTP and native callbacks must run outside Tokio's async workers
    // and the UI thread. This service never acquires the business Store lock.
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<IdentityState>();
        let service = state
            .0
            .try_lock()
            .map_err(|_| DriverError::invalid_state("identity_busy"))?;
        action(&service)
    })
    .await
    .map_err(|_| DriverError::invalid_state("identity_service_unavailable"))?
}
#[tauri::command]
pub async fn identity_status(app: AppHandle) -> Result<IdentitySnapshot, DriverError> {
    run(app, IdentityService::snapshot).await
}
#[tauri::command]
pub async fn identity_sign_in(
    app: AppHandle,
    provider: Provider,
) -> Result<IdentitySnapshot, DriverError> {
    run(app, move |s| s.sign_in(provider)).await
}
#[tauri::command]
pub async fn identity_link(
    app: AppHandle,
    provider: Provider,
) -> Result<IdentitySnapshot, DriverError> {
    run(app, move |s| s.link(provider)).await
}
#[tauri::command]
pub async fn identity_unlink(
    app: AppHandle,
    provider: Provider,
) -> Result<IdentitySnapshot, DriverError> {
    run(app, move |s| s.unlink(provider)).await
}
#[tauri::command]
pub async fn identity_sign_out(app: AppHandle) -> Result<(), DriverError> {
    run(app, IdentityService::sign_out).await
}
#[tauri::command]
pub async fn identity_delete_account(app: AppHandle, confirmed: bool) -> Result<(), DriverError> {
    run(app, move |s| s.delete_account(confirmed)).await
}
