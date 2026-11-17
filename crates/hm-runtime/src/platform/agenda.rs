//! Device scheduling contracts. No business database, UI or provider SDK types.
use super::{DriverError, DriverResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Authorization {
    NotDetermined,
    Granted,
    Denied,
    Restricted,
    Unavailable,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NotificationMode {
    Immediate,
    Scheduled,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSupport {
    pub installed: bool,
    pub authorization: Authorization,
    pub mode: NotificationMode,
    pub pending_limit: usize,
}
/// Current business dates are floating local wall-clock dates, not UTC instants.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDateTime {
    pub year: i32,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceNotification {
    pub id: String,
    pub revision: String,
    pub event_id: String,
    pub schedule_key: String,
    pub title: String,
    pub body: String,
    pub when: LocalDateTime,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationRecord {
    pub id: String,
    pub revision: String,
}
pub trait NotificationDriver: Send + Sync {
    fn support(&self) -> DriverResult<NotificationSupport>;
    /// Called only from an explicit user action, never during reconciliation.
    fn request_authorization(&self) -> DriverResult<Authorization>;
    fn pending(&self) -> DriverResult<Vec<NotificationRecord>> {
        Err(DriverError::unsupported("scheduled_notifications"))
    }
    fn delivered(&self) -> DriverResult<Vec<NotificationRecord>> {
        Ok(vec![])
    }
    fn schedule(&self, _: &DeviceNotification) -> DriverResult<()> {
        Err(DriverError::unsupported("scheduled_notifications"))
    }
    fn show(&self, _: &DeviceNotification) -> DriverResult<()> {
        Err(DriverError::unsupported("system_notifications"))
    }
    fn cancel(&self, _: &[String]) -> DriverResult<()> {
        Err(DriverError::unsupported("scheduled_notifications"))
    }
    fn remove_delivered(&self, _: &[String]) -> DriverResult<()> {
        Ok(())
    }
    fn open_settings(&self) -> DriverResult<()> {
        Err(DriverError::unsupported("notification_settings"))
    }
}
pub struct UnavailableNotifications;
impl NotificationDriver for UnavailableNotifications {
    fn support(&self) -> DriverResult<NotificationSupport> {
        Ok(NotificationSupport {
            installed: false,
            authorization: Authorization::Unavailable,
            mode: NotificationMode::Scheduled,
            pending_limit: 0,
        })
    }
    fn request_authorization(&self) -> DriverResult<Authorization> {
        Err(DriverError::unsupported("system_notifications"))
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSupport {
    pub installed: bool,
    pub authorization: Authorization,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarTarget {
    pub id: String,
    pub title: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarCopy {
    pub event_id: String,
    pub title: String,
    pub start: LocalDateTime,
    pub end: LocalDateTime,
    pub all_day: bool,
    pub location: String,
    pub notes: String,
}
pub trait CalendarDriver: Send + Sync {
    fn provider(&self) -> Option<&'static str> {
        None
    }
    fn support(&self) -> DriverResult<CalendarSupport>;
    fn request_authorization(&self) -> DriverResult<Authorization>;
    fn targets(&self) -> DriverResult<Vec<CalendarTarget>>;
    /// Idempotent on an existing reference. Verify app ownership before changing
    /// a referenced record; never silently recreate a user-deleted external copy.
    fn upsert(
        &self,
        event: &CalendarCopy,
        target: &str,
        external: Option<&str>,
    ) -> DriverResult<String>;
    fn remove(&self, event_id: &str, external: &str) -> DriverResult<()>;
}
pub struct UnavailableCalendar;
impl CalendarDriver for UnavailableCalendar {
    fn support(&self) -> DriverResult<CalendarSupport> {
        Ok(CalendarSupport {
            installed: false,
            authorization: Authorization::Unavailable,
        })
    }
    fn request_authorization(&self) -> DriverResult<Authorization> {
        Err(DriverError::unsupported("system_calendar"))
    }
    fn targets(&self) -> DriverResult<Vec<CalendarTarget>> {
        Err(DriverError::unsupported("system_calendar"))
    }
    fn upsert(&self, _: &CalendarCopy, _: &str, _: Option<&str>) -> DriverResult<String> {
        Err(DriverError::unsupported("system_calendar"))
    }
    fn remove(&self, _: &str, _: &str) -> DriverResult<()> {
        Err(DriverError::unsupported("system_calendar"))
    }
}
