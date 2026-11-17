use hm_runtime::platform::*;
use serde::Deserialize;
use tauri::{plugin::PluginHandle, Manager};
tauri::ios_plugin_binding!(init_plugin_hm_agenda);
#[derive(Clone)]
struct Bridge(PluginHandle<tauri::Wry>);
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Reply {
    error: Option<String>,
    notification_support: Option<NotificationSupport>,
    calendar_support: Option<CalendarSupport>,
    authorization: Option<Authorization>,
    records: Option<Vec<NotificationRecord>>,
    targets: Option<Vec<CalendarTarget>>,
    external_id: Option<String>,
}
fn invalid() -> DriverError {
    DriverError::invalid_state("agenda_bridge_failed")
}
impl Bridge {
    fn call(&self, command: &str, payload: serde_json::Value) -> DriverResult<Reply> {
        let reply: Reply = self
            .0
            .run_mobile_plugin(command, payload)
            .map_err(|_| invalid())?;
        if let Some(code) = &reply.error {
            return Err(DriverError::invalid_state(code));
        }
        Ok(reply)
    }
}
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("hm-agenda")
        .setup(|app, api| {
            let handle = api.register_ios_plugin(init_plugin_hm_agenda)?;
            app.manage(Bridge(handle));
            Ok(())
        })
        .build()
}
struct Notifications(Bridge);
struct Calendars(Bridge);
pub fn notification_driver(app: &tauri::AppHandle) -> Box<dyn NotificationDriver> {
    Box::new(Notifications(app.state::<Bridge>().inner().clone()))
}
pub fn calendar_driver(app: &tauri::AppHandle) -> Box<dyn CalendarDriver> {
    Box::new(Calendars(app.state::<Bridge>().inner().clone()))
}
impl NotificationDriver for Notifications {
    fn support(&self) -> DriverResult<NotificationSupport> {
        self.0
            .call("notificationSupport", serde_json::json!({}))?
            .notification_support
            .ok_or_else(invalid)
    }
    fn request_authorization(&self) -> DriverResult<Authorization> {
        self.0
            .call("requestNotifications", serde_json::json!({}))?
            .authorization
            .ok_or_else(invalid)
    }
    fn pending(&self) -> DriverResult<Vec<NotificationRecord>> {
        self.0
            .call("pending", serde_json::json!({}))?
            .records
            .ok_or_else(invalid)
    }
    fn delivered(&self) -> DriverResult<Vec<NotificationRecord>> {
        self.0
            .call("delivered", serde_json::json!({}))?
            .records
            .ok_or_else(invalid)
    }
    fn schedule(&self, message: &DeviceNotification) -> DriverResult<()> {
        self.0
            .call("schedule", serde_json::json!({"message":message}))?;
        Ok(())
    }
    fn cancel(&self, ids: &[String]) -> DriverResult<()> {
        self.0.call("cancel", serde_json::json!({"ids":ids}))?;
        Ok(())
    }
    fn remove_delivered(&self, ids: &[String]) -> DriverResult<()> {
        self.0
            .call("removeDelivered", serde_json::json!({"ids":ids}))?;
        Ok(())
    }
    fn open_settings(&self) -> DriverResult<()> {
        self.0.call("notificationSettings", serde_json::json!({}))?;
        Ok(())
    }
}
impl CalendarDriver for Calendars {
    fn provider(&self) -> Option<&'static str> {
        Some("ios-eventkit")
    }
    fn support(&self) -> DriverResult<CalendarSupport> {
        self.0
            .call("calendarSupport", serde_json::json!({}))?
            .calendar_support
            .ok_or_else(invalid)
    }
    fn request_authorization(&self) -> DriverResult<Authorization> {
        self.0
            .call("requestCalendar", serde_json::json!({}))?
            .authorization
            .ok_or_else(invalid)
    }
    fn targets(&self) -> DriverResult<Vec<CalendarTarget>> {
        self.0
            .call("calendarTargets", serde_json::json!({}))?
            .targets
            .ok_or_else(invalid)
    }
    fn upsert(
        &self,
        event: &CalendarCopy,
        target: &str,
        external: Option<&str>,
    ) -> DriverResult<String> {
        self.0
            .call(
                "calendarUpsert",
                serde_json::json!({"event":event,"target":target,"external":external}),
            )?
            .external_id
            .ok_or_else(invalid)
    }
    fn remove(&self, event_id: &str, external: &str) -> DriverResult<()> {
        self.0.call(
            "calendarRemove",
            serde_json::json!({"eventId":event_id,"external":external}),
        )?;
        Ok(())
    }
}
