use chrono::NaiveDateTime;
use hm_application::agenda::{CalendarService, NotificationService, NotificationSnapshot};
use hm_core::{CalendarEvent, Reminder};
use hm_runtime::platform::*;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
fn time() -> NaiveDateTime {
    chrono::NaiveDate::from_ymd_opt(2026, 11, 17)
        .unwrap()
        .and_hms_opt(8, 0, 0)
        .unwrap()
}
fn event(n: u64) -> CalendarEvent {
    CalendarEvent {
        id: format!("00000000-0000-0000-0000-{n:012}"),
        title: format!("虚构安排{n}"),
        start_date: "2026-11-17".into(),
        end_date: "2026-11-17".into(),
        start_time: Some("10:00".into()),
        end_time: Some("11:00".into()),
        case_id: None,
        location: String::new(),
        notes: String::new(),
        reminder_minutes: Some(15),
    }
}
struct Notifications {
    auth: Authorization,
    mode: NotificationMode,
    pending: BTreeMap<String, String>,
    delivered: BTreeMap<String, String>,
    puts: usize,
    shows: usize,
    requests: usize,
    fail_show: bool,
    limit: usize,
}
impl Default for Notifications {
    fn default() -> Self {
        Self {
            auth: Authorization::Granted,
            mode: NotificationMode::Scheduled,
            pending: BTreeMap::new(),
            delivered: BTreeMap::new(),
            puts: 0,
            shows: 0,
            requests: 0,
            fail_show: false,
            limit: 64,
        }
    }
}
struct NotificationAdapter(Arc<Mutex<Notifications>>);
impl NotificationDriver for NotificationAdapter {
    fn support(&self) -> DriverResult<NotificationSupport> {
        let s = self.0.lock().unwrap();
        Ok(NotificationSupport {
            installed: true,
            authorization: s.auth,
            mode: s.mode,
            pending_limit: s.limit,
        })
    }
    fn request_authorization(&self) -> DriverResult<Authorization> {
        let mut s = self.0.lock().unwrap();
        s.requests += 1;
        s.auth = Authorization::Granted;
        Ok(s.auth)
    }
    fn pending(&self) -> DriverResult<Vec<NotificationRecord>> {
        Ok(self
            .0
            .lock()
            .unwrap()
            .pending
            .iter()
            .map(|(id, revision)| NotificationRecord {
                id: id.clone(),
                revision: revision.clone(),
            })
            .collect())
    }
    fn delivered(&self) -> DriverResult<Vec<NotificationRecord>> {
        Ok(self
            .0
            .lock()
            .unwrap()
            .delivered
            .iter()
            .map(|(id, revision)| NotificationRecord {
                id: id.clone(),
                revision: revision.clone(),
            })
            .collect())
    }
    fn schedule(&self, p: &DeviceNotification) -> DriverResult<()> {
        let mut s = self.0.lock().unwrap();
        s.puts += 1;
        s.pending.insert(p.id.clone(), p.revision.clone());
        Ok(())
    }
    fn show(&self, _: &DeviceNotification) -> DriverResult<()> {
        let mut s = self.0.lock().unwrap();
        s.shows += 1;
        if s.fail_show && s.shows > 1 {
            return Err(DriverError::invalid_state("test_delivery_failed"));
        }
        Ok(())
    }
    fn cancel(&self, ids: &[String]) -> DriverResult<()> {
        let mut s = self.0.lock().unwrap();
        for id in ids {
            s.pending.remove(id);
        }
        Ok(())
    }
    fn remove_delivered(&self, ids: &[String]) -> DriverResult<()> {
        let mut s = self.0.lock().unwrap();
        for id in ids {
            s.delivered.remove(id);
        }
        Ok(())
    }
}
fn snapshot(events: Vec<CalendarEvent>) -> NotificationSnapshot {
    NotificationSnapshot {
        events,
        due: vec![],
        now: time(),
        enabled: true,
    }
}
#[test]
fn permission_is_explicit_and_denial_cancels_only_owned_requests() {
    let state = Arc::new(Mutex::new(Notifications {
        auth: Authorization::NotDetermined,
        ..Default::default()
    }));
    state
        .lock()
        .unwrap()
        .pending
        .insert("another-subsystem".into(), "keep".into());
    let service = NotificationService::new(Box::new(NotificationAdapter(state.clone())));
    let result = service.reconcile(snapshot(vec![event(1)])).unwrap();
    assert_eq!(result.status.authorization, Authorization::NotDetermined);
    assert_eq!(state.lock().unwrap().requests, 0);
    assert_eq!(state.lock().unwrap().puts, 0);
    service.request_authorization().unwrap();
    service.reconcile(snapshot(vec![event(1)])).unwrap();
    state.lock().unwrap().auth = Authorization::Denied;
    service.reconcile(snapshot(vec![])).unwrap();
    let s = state.lock().unwrap();
    assert_eq!(s.requests, 1);
    assert_eq!(s.pending.len(), 1);
    assert!(s.pending.contains_key("another-subsystem"));
}
#[test]
fn scheduling_is_idempotent_reserves_capacity_and_updates_or_removes_stale_revisions() {
    let state = Arc::new(Mutex::new(Notifications {
        limit: 3,
        ..Default::default()
    }));
    state
        .lock()
        .unwrap()
        .pending
        .insert("another-subsystem".into(), "keep".into());
    let service = NotificationService::new(Box::new(NotificationAdapter(state.clone())));
    let events = (1..=4).map(event).collect::<Vec<_>>();
    let result = service.reconcile(snapshot(events.clone())).unwrap();
    assert_eq!(result.status.scheduled, 2);
    assert_eq!(result.status.deferred, 2);
    service.reconcile(snapshot(events)).unwrap();
    assert_eq!(state.lock().unwrap().puts, 2);
    let mut changed = event(1);
    changed.start_time = Some("12:00".into());
    changed.end_time = Some("13:00".into());
    service.reconcile(snapshot(vec![changed])).unwrap();
    assert_eq!(state.lock().unwrap().puts, 3);
    service.reconcile(snapshot(vec![])).unwrap();
    assert_eq!(state.lock().unwrap().pending.len(), 1);
}
#[test]
fn successful_immediate_deliveries_survive_a_later_failure_and_scheduled_is_not_delivered() {
    let state = Arc::new(Mutex::new(Notifications {
        mode: NotificationMode::Immediate,
        fail_show: true,
        ..Default::default()
    }));
    let service = NotificationService::new(Box::new(NotificationAdapter(state.clone())));
    let mut context = snapshot(vec![event(1), event(2)]);
    context.due = (1..=2)
        .map(|n| Reminder {
            event_id: event(n).id,
            title: String::new(),
            schedule_key: "key".into(),
            when: String::new(),
        })
        .collect();
    let result = service.reconcile(context).unwrap();
    assert_eq!(result.delivered.len(), 1);
    assert_eq!(
        result.status.error_code.as_deref(),
        Some("test_delivery_failed")
    );
    state.lock().unwrap().mode = NotificationMode::Scheduled;
    assert!(service
        .reconcile(snapshot(vec![event(1)]))
        .unwrap()
        .delivered
        .is_empty());
}
#[derive(Default)]
struct Calendar {
    auth: bool,
    requests: usize,
    puts: usize,
    removes: usize,
    copies: BTreeMap<String, CalendarCopy>,
}
struct CalendarAdapter(Arc<Mutex<Calendar>>);
impl CalendarDriver for CalendarAdapter {
    fn provider(&self) -> Option<&'static str> {
        Some("test-calendar")
    }
    fn support(&self) -> DriverResult<CalendarSupport> {
        Ok(CalendarSupport {
            installed: true,
            authorization: if self.0.lock().unwrap().auth {
                Authorization::Granted
            } else {
                Authorization::NotDetermined
            },
        })
    }
    fn request_authorization(&self) -> DriverResult<Authorization> {
        let mut s = self.0.lock().unwrap();
        s.requests += 1;
        s.auth = true;
        Ok(Authorization::Granted)
    }
    fn targets(&self) -> DriverResult<Vec<CalendarTarget>> {
        Ok(vec![CalendarTarget {
            id: "writable".into(),
            title: "虚构日历".into(),
        }])
    }
    fn upsert(&self, e: &CalendarCopy, _: &str, reference: Option<&str>) -> DriverResult<String> {
        let mut s = self.0.lock().unwrap();
        s.puts += 1;
        let id = reference
            .map(str::to_owned)
            .unwrap_or_else(|| format!("copy-{}", e.event_id));
        s.copies.insert(id.clone(), e.clone());
        Ok(id)
    }
    fn remove(&self, _: &str, id: &str) -> DriverResult<()> {
        let mut s = self.0.lock().unwrap();
        s.removes += 1;
        s.copies.remove(id);
        Ok(())
    }
}
#[test]
fn system_calendar_links_are_local_survive_restart_and_reconcile_changes_deletion_and_restore() {
    let state = Arc::new(Mutex::new(Calendar::default()));
    let directory = tempfile::tempdir().unwrap();
    let mut service =
        CalendarService::open(Box::new(CalendarAdapter(state.clone())), directory.path()).unwrap();
    service.reconcile(&[event(1)]).unwrap();
    assert_eq!(state.lock().unwrap().requests, 0);
    service.request_targets().unwrap();
    service.attach(&event(1), "writable").unwrap();
    service.reconcile(&[event(1)]).unwrap();
    assert_eq!(state.lock().unwrap().puts, 1);
    drop(service);
    let mut service =
        CalendarService::open(Box::new(CalendarAdapter(state.clone())), directory.path()).unwrap();
    let mut changed = event(1);
    changed.title = "修改后".into();
    changed.start_time = None;
    changed.end_time = None;
    service.reconcile(&[changed.clone()]).unwrap();
    {
        let s = state.lock().unwrap();
        assert_eq!(s.copies.len(), 1);
        let copy = s.copies.values().next().unwrap();
        assert!(copy.all_day);
        assert_eq!(copy.end.day, 18);
    }
    service.reconcile(&[]).unwrap();
    assert!(state.lock().unwrap().copies.is_empty());
    service.reconcile(&[changed]).unwrap();
    assert_eq!(state.lock().unwrap().copies.len(), 1);
    service.detach(&event(1).id).unwrap();
    service.reconcile(&[]).unwrap();
    assert_eq!(state.lock().unwrap().copies.len(), 1);
}
