use super::{hash, local};
use crate::errors::core_error;
use chrono::NaiveDateTime;
use hm_core::{reminder_timing, CalendarEvent, Reminder};
use hm_runtime::platform::{
    Authorization, DeviceNotification, DriverError, DriverResult, NotificationDriver,
    NotificationMode,
};
use serde::Serialize;
use std::collections::BTreeMap;
const PREFIX: &str = "anjian.reminder.";
fn identifier(event: &str) -> String {
    format!("{PREFIX}{event}")
}
fn owned(id: &str) -> bool {
    id.strip_prefix(PREFIX)
        .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationStatus {
    pub installed: bool,
    pub authorization: Authorization,
    pub enabled: bool,
    pub scheduled: usize,
    pub deferred: usize,
    pub error_code: Option<String>,
}
pub struct NotificationSnapshot {
    pub events: Vec<CalendarEvent>,
    pub due: Vec<Reminder>,
    pub now: NaiveDateTime,
    pub enabled: bool,
}
pub struct NotificationRun {
    pub status: NotificationStatus,
    pub delivered: Vec<Reminder>,
}
pub struct NotificationService {
    driver: Box<dyn NotificationDriver>,
}
impl NotificationService {
    pub fn new(driver: Box<dyn NotificationDriver>) -> Self {
        Self { driver }
    }
    pub fn status(&self, enabled: bool) -> DriverResult<NotificationStatus> {
        let support = self.driver.support()?;
        Ok(NotificationStatus {
            installed: support.installed,
            authorization: support.authorization,
            enabled,
            scheduled: 0,
            deferred: 0,
            error_code: None,
        })
    }
    pub fn request_authorization(&self) -> DriverResult<Authorization> {
        self.driver.request_authorization()
    }
    pub fn open_settings(&self) -> DriverResult<()> {
        self.driver.open_settings()
    }
    pub fn reconcile(&self, snapshot: NotificationSnapshot) -> DriverResult<NotificationRun> {
        let support = self.driver.support()?;
        let allowed = snapshot.enabled && support.authorization == Authorization::Granted;
        let mut run = NotificationRun {
            status: NotificationStatus {
                installed: support.installed,
                authorization: support.authorization,
                enabled: snapshot.enabled,
                scheduled: 0,
                deferred: 0,
                error_code: None,
            },
            delivered: vec![],
        };
        if !support.installed {
            return Ok(run);
        }
        let mut active = BTreeMap::new();
        let mut future = vec![];
        let mut messages = BTreeMap::new();
        for event in &snapshot.events {
            uuid::Uuid::parse_str(&event.id)
                .map_err(|_| DriverError::invalid_state("notification_plan_invalid"))?;
            let Some(timing) = reminder_timing(event).map_err(core_error)? else {
                continue;
            };
            let id = identifier(&event.id);
            let revision = hash(&(&event.id, &event.title, &timing.schedule_key));
            let message = DeviceNotification {
                id: id.clone(),
                revision: revision.clone(),
                event_id: event.id.clone(),
                schedule_key: timing.schedule_key,
                title: event.title.clone(),
                body: timing.when.format("%m月%d日 %H:%M").to_string(),
                when: local(timing.due),
            };
            active.insert(id.clone(), revision);
            messages.insert(event.id.clone(), message.clone());
            if timing.due > snapshot.now {
                future.push((timing.due, message));
            }
        }
        if support.mode == NotificationMode::Immediate {
            if allowed {
                for due in snapshot.due {
                    if let Some(message) = messages.get(&due.event_id) {
                        match self.driver.show(message) {
                            Ok(()) => run.delivered.push(due),
                            Err(error) => {
                                run.status.error_code = Some(error.code);
                                break;
                            }
                        }
                    }
                }
            }
            return Ok(run);
        }
        if support.pending_limit == 0 || support.pending_limit > 4096 {
            return Err(DriverError::invalid_state("notification_plan_invalid"));
        }
        // Reserve space for unrelated notifications owned by another subsystem.
        let pending = self.driver.pending()?;
        let unrelated = pending.iter().filter(|record| !owned(&record.id)).count();
        let capacity = support.pending_limit.saturating_sub(unrelated);
        future.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.id.cmp(&b.1.id)));
        run.status.deferred = if allowed {
            future.len().saturating_sub(capacity)
        } else {
            0
        };
        let desired = if allowed {
            future
                .into_iter()
                .take(capacity)
                .map(|(_, item)| (item.id.clone(), item))
                .collect::<BTreeMap<_, _>>()
        } else {
            BTreeMap::new()
        };
        let obsolete = pending
            .iter()
            .filter(|record| owned(&record.id) && !desired.contains_key(&record.id))
            .map(|record| record.id.clone())
            .collect::<Vec<_>>();
        if !obsolete.is_empty() {
            self.driver.cancel(&obsolete)?;
        }
        for (id, message) in &desired {
            if !pending
                .iter()
                .any(|record| &record.id == id && record.revision == message.revision)
            {
                self.driver.schedule(message)?;
            }
        }
        let stale = self
            .driver
            .delivered()?
            .into_iter()
            .filter(|record| {
                owned(&record.id) && (!allowed || active.get(&record.id) != Some(&record.revision))
            })
            .map(|record| record.id)
            .collect::<Vec<_>>();
        if !stale.is_empty() {
            self.driver.remove_delivered(&stale)?;
        }
        run.status.scheduled = desired.len();
        Ok(run)
    }
}
