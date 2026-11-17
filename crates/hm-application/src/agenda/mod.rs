//! Platform-independent device projections of the single business calendar.
mod calendar;
mod notifications;
pub use calendar::{CalendarLink, CalendarService, CalendarStatus};
use chrono::{Datelike, NaiveDateTime, Timelike};
use hm_runtime::platform::LocalDateTime;
pub use notifications::{
    NotificationRun, NotificationService, NotificationSnapshot, NotificationStatus,
};
pub(crate) fn local(value: NaiveDateTime) -> LocalDateTime {
    LocalDateTime {
        year: value.year(),
        month: value.month(),
        day: value.day(),
        hour: value.hour(),
        minute: value.minute(),
    }
}
pub(crate) fn hash(value: &impl serde::Serialize) -> String {
    use sha2::{Digest, Sha256};
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(value).expect("finite calendar projection"))
    )
}
