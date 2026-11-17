//! One post-commit coordination path for every business writer and platform.
use crate::AppState;
use hm_application::agenda::{
    CalendarLink, CalendarService, CalendarStatus, NotificationService, NotificationSnapshot,
    NotificationStatus,
};
use hm_core::StorageLocation;
use hm_runtime::{
    platform::{
        Authorization, CalendarDriver, CalendarTarget, DriverError, DriverResult,
        NotificationDriver,
    },
    ActivityGate,
};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use tauri::{AppHandle, Emitter, Manager};
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgendaStatus {
    notifications: NotificationStatus,
    calendar: CalendarStatus,
}
pub struct AgendaState {
    notifications: Mutex<NotificationService>,
    calendar: Mutex<DriverResult<CalendarService>>,
    status: Mutex<AgendaStatus>,
    changes: AtomicU64,
    gate: ActivityGate,
}
fn unavailable() -> DriverError {
    DriverError::invalid_state("agenda_unavailable")
}
pub fn setup(
    app: &tauri::App,
    notifications: Box<dyn NotificationDriver>,
    calendar: Box<dyn CalendarDriver>,
) {
    let path = app
        .state::<StorageLocation>()
        .data_directory
        .join("agenda-private");
    app.manage(AgendaState {
        notifications: Mutex::new(NotificationService::new(notifications)),
        calendar: Mutex::new(CalendarService::open(calendar, &path)),
        status: Mutex::new(AgendaStatus {
            notifications: NotificationStatus {
                installed: false,
                authorization: Authorization::Unavailable,
                enabled: false,
                scheduled: 0,
                deferred: 0,
                error_code: None,
            },
            calendar: CalendarStatus {
                installed: false,
                authorization: Authorization::Unavailable,
                linked: 0,
                failed: 0,
                error_code: None,
            },
        }),
        changes: AtomicU64::new(0),
        gate: ActivityGate::default(),
    });
    changed(app.handle());
}
fn publish(app: &AppHandle) {
    if let Ok(status) = app.state::<AgendaState>().status.lock().map(|s| s.clone()) {
        let _ = app.emit("agenda-status", status);
    }
}
pub(crate) fn changed(app: &AppHandle) {
    let Some(state) = app.try_state::<AgendaState>() else {
        return;
    };
    state.changes.fetch_add(1, Ordering::AcqRel);
    schedule(app);
}
fn schedule(app: &AppHandle) {
    let Some(state) = app.try_state::<AgendaState>() else {
        return;
    };
    let Some(permit) = state.gate.try_enter() else {
        return;
    };
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AgendaState>();
        let observed = loop {
            let observed = state.changes.load(Ordering::Acquire);
            if let Err(error) = reconcile(&app, &state) {
                if let Ok(mut status) = state.status.lock() {
                    status.notifications.error_code = Some(error.code);
                }
            }
            publish(&app);
            if observed == state.changes.load(Ordering::Acquire) {
                break observed;
            }
        };
        drop(permit);
        // Catch a commit racing with release of the coalescing permit.
        if observed != state.changes.load(Ordering::Acquire) {
            schedule(&app);
        }
    });
}
fn reconcile(app: &AppHandle, state: &AgendaState) -> DriverResult<()> {
    let now = chrono::Local::now().naive_local();
    let (events, due, enabled) = {
        let data = app.state::<AppState>();
        let store = data.0.lock()?;
        (
            store
                .device_calendar_events()
                .map_err(hm_application::errors::core_error)?,
            store
                .due_reminders(now)
                .map_err(hm_application::errors::core_error)?,
            store
                .setting("notifications")
                .map_err(hm_application::errors::core_error)?
                .as_deref()
                != Some("false"),
        )
    };
    let result = state
        .notifications
        .lock()
        .map_err(|_| unavailable())?
        .reconcile(NotificationSnapshot {
            events: events.clone(),
            due,
            now,
            enabled,
        });
    match result {
        Ok(run) => {
            state
                .status
                .lock()
                .map_err(|_| unavailable())?
                .notifications = run.status;
            if !run.delivered.is_empty() {
                let data = app.state::<AppState>();
                let store = data.0.lock()?;
                for receipt in run.delivered {
                    store
                        .acknowledge_reminder(&receipt.event_id, &receipt.schedule_key)
                        .map_err(hm_application::errors::core_error)?;
                }
            }
        }
        Err(error) => {
            state
                .status
                .lock()
                .map_err(|_| unavailable())?
                .notifications
                .error_code = Some(error.code)
        }
    }
    let mut calendar = state.calendar.lock().map_err(|_| unavailable())?;
    match calendar.as_mut() {
        Ok(service) => match service.reconcile(&events) {
            Ok(status) => state.status.lock().map_err(|_| unavailable())?.calendar = status,
            Err(error) => {
                let mut status = service.status()?;
                status.error_code = Some(error.code);
                state.status.lock().map_err(|_| unavailable())?.calendar = status;
            }
        },
        Err(error) => {
            state
                .status
                .lock()
                .map_err(|_| unavailable())?
                .calendar
                .error_code = Some(error.code.clone())
        }
    }
    Ok(())
}
async fn run<T: Send + 'static>(
    app: AppHandle,
    action: impl FnOnce(&AppHandle, &AgendaState) -> DriverResult<T> + Send + 'static,
) -> DriverResult<T> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AgendaState>();
        action(&app, &state)
    })
    .await
    .map_err(|_| unavailable())?
}
#[tauri::command]
pub fn agenda_status(app: AppHandle) -> DriverResult<AgendaStatus> {
    app.state::<AgendaState>()
        .status
        .lock()
        .map(|s| s.clone())
        .map_err(|_| unavailable())
}
#[tauri::command]
pub fn agenda_refresh(app: AppHandle) -> DriverResult<AgendaStatus> {
    changed(&app);
    agenda_status(app)
}
#[tauri::command]
pub async fn agenda_request_notifications(app: AppHandle) -> DriverResult<Authorization> {
    run(app, |app, state| {
        let permission = state
            .notifications
            .lock()
            .map_err(|_| unavailable())?
            .request_authorization()?;
        state
            .status
            .lock()
            .map_err(|_| unavailable())?
            .notifications
            .authorization = permission;
        changed(app);
        publish(app);
        Ok(permission)
    })
    .await
}
#[tauri::command]
pub async fn agenda_notification_settings(app: AppHandle) -> DriverResult<()> {
    run(app, |_, s| {
        s.notifications
            .lock()
            .map_err(|_| unavailable())?
            .open_settings()
    })
    .await
}
#[tauri::command]
pub async fn agenda_calendar_targets(app: AppHandle) -> DriverResult<Vec<CalendarTarget>> {
    run(app, |app, state| {
        let mut calendar = state.calendar.lock().map_err(|_| unavailable())?;
        let service = calendar.as_mut().map_err(|e| e.clone())?;
        let result = service.request_targets();
        state.status.lock().map_err(|_| unavailable())?.calendar = service.status()?;
        publish(app);
        result
    })
    .await
}
#[tauri::command]
pub async fn agenda_calendar_link(
    app: AppHandle,
    event_id: String,
) -> DriverResult<Option<CalendarLink>> {
    run(app, move |_, state| {
        state
            .calendar
            .lock()
            .map_err(|_| unavailable())?
            .as_ref()
            .map(|service| service.link(&event_id))
            .map_err(|e| e.clone())
    })
    .await
}
#[tauri::command]
pub async fn agenda_calendar_attach(
    app: AppHandle,
    event_id: String,
    target_id: String,
) -> DriverResult<CalendarLink> {
    run(app, move |app, state| {
        let event = app
            .state::<AppState>()
            .0
            .lock()?
            .device_calendar_events()
            .map_err(hm_application::errors::core_error)?
            .into_iter()
            .find(|event| event.id == event_id)
            .ok_or_else(|| DriverError::invalid_state("resource_not_found"))?;
        let result = state
            .calendar
            .lock()
            .map_err(|_| unavailable())?
            .as_mut()
            .map_err(|e| e.clone())?
            .attach(&event, &target_id)?;
        changed(app);
        Ok(result)
    })
    .await
}
#[tauri::command]
pub async fn agenda_calendar_detach(app: AppHandle, event_id: String) -> DriverResult<()> {
    run(app, move |app, state| {
        state
            .calendar
            .lock()
            .map_err(|_| unavailable())?
            .as_mut()
            .map_err(|e| e.clone())?
            .detach(&event_id)?;
        changed(app);
        Ok(())
    })
    .await
}
