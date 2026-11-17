use super::{hash, local};
use chrono::{NaiveDate, NaiveTime, TimeDelta};
use hm_core::CalendarEvent;
use hm_runtime::platform::{
    Authorization, CalendarCopy, CalendarDriver, CalendarSupport, CalendarTarget, DriverError,
    DriverResult,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    io::Write,
    path::{Path, PathBuf},
};
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarLink {
    pub event_id: String,
    pub target_id: String,
    pub target_title: String,
    pub external_id: Option<String>,
    fingerprint: Option<String>,
    pub error_code: Option<String>,
}
#[derive(Serialize, Deserialize)]
struct Links {
    format: u8,
    provider: Option<String>,
    links: BTreeMap<String, CalendarLink>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarStatus {
    pub installed: bool,
    pub authorization: Authorization,
    pub linked: usize,
    pub failed: usize,
    pub error_code: Option<String>,
}
pub struct CalendarService {
    driver: Box<dyn CalendarDriver>,
    path: PathBuf,
    state: Links,
}
fn invalid() -> DriverError {
    DriverError::invalid_state("calendar_state_invalid")
}
fn projection(event: &CalendarEvent) -> DriverResult<CalendarCopy> {
    let start = NaiveDate::parse_from_str(&event.start_date, "%Y-%m-%d").map_err(|_| invalid())?;
    let end = NaiveDate::parse_from_str(&event.end_date, "%Y-%m-%d").map_err(|_| invalid())?;
    let all_day = event.start_time.is_none();
    let (start, end) = if all_day {
        (
            start.and_time(NaiveTime::MIN),
            end.checked_add_signed(TimeDelta::days(1))
                .ok_or_else(invalid)?
                .and_time(NaiveTime::MIN),
        )
    } else {
        let parse = |value: &Option<String>| {
            NaiveTime::parse_from_str(value.as_deref().unwrap_or(""), "%H:%M")
                .map_err(|_| invalid())
        };
        (
            start.and_time(parse(&event.start_time)?),
            end.and_time(parse(&event.end_time)?),
        )
    };
    if end <= start {
        return Err(invalid());
    }
    Ok(CalendarCopy {
        event_id: event.id.clone(),
        title: event.title.clone(),
        start: local(start),
        end: local(end),
        all_day,
        location: event.location.clone(),
        notes: event.notes.clone(),
    })
}
impl CalendarService {
    pub fn open(driver: Box<dyn CalendarDriver>, directory: &Path) -> DriverResult<Self> {
        let path = directory.join("calendar-links.json");
        let state = if path.exists() {
            if std::fs::metadata(&path)?.len() > 1024 * 1024 {
                return Err(invalid());
            }
            let state: Links =
                serde_json::from_slice(&std::fs::read(&path)?).map_err(|_| invalid())?;
            if state.format != 1
                || state.links.len() > 2000
                || state
                    .links
                    .iter()
                    .any(|(id, link)| uuid::Uuid::parse_str(id).is_err() || id != &link.event_id)
            {
                return Err(invalid());
            }
            state
        } else {
            Links {
                format: 1,
                provider: driver.provider().map(str::to_owned),
                links: BTreeMap::new(),
            }
        };
        Ok(Self {
            driver,
            path,
            state,
        })
    }
    fn persist(&self) -> DriverResult<()> {
        let directory = self.path.parent().ok_or_else(invalid)?;
        std::fs::create_dir_all(directory)?;
        let mut file = tempfile::NamedTempFile::new_in(directory)?;
        file.write_all(&serde_json::to_vec(&self.state).map_err(|_| invalid())?)?;
        file.as_file().sync_all()?;
        file.persist(&self.path)
            .map_err(|error| DriverError::from(error.error))?;
        Ok(())
    }
    pub fn support(&self) -> DriverResult<CalendarSupport> {
        self.driver.support()
    }
    pub fn status(&self) -> DriverResult<CalendarStatus> {
        let support = self.support()?;
        Ok(CalendarStatus {
            installed: support.installed,
            authorization: support.authorization,
            linked: self.state.links.len(),
            failed: self
                .state
                .links
                .values()
                .filter(|link| link.error_code.is_some())
                .count(),
            error_code: None,
        })
    }
    pub fn request_targets(&self) -> DriverResult<Vec<CalendarTarget>> {
        if self.driver.request_authorization()? != Authorization::Granted {
            return Err(DriverError::invalid_state("calendar_permission_denied"));
        }
        self.driver.targets()
    }
    pub fn link(&self, id: &str) -> Option<CalendarLink> {
        self.state.links.get(id).cloned()
    }
    pub fn attach(&mut self, event: &CalendarEvent, target_id: &str) -> DriverResult<CalendarLink> {
        if self.state.provider.as_deref() != self.driver.provider() {
            return Err(invalid());
        }
        if self.support()?.authorization != Authorization::Granted {
            return Err(DriverError::invalid_state("calendar_permission_denied"));
        }
        let target = self
            .driver
            .targets()?
            .into_iter()
            .find(|target| target.id == target_id)
            .ok_or_else(|| DriverError::invalid_state("calendar_target_missing"))?;
        if self
            .state
            .links
            .get(&event.id)
            .is_some_and(|link| link.target_id != target_id)
        {
            return Err(DriverError::invalid_state("calendar_already_linked"));
        }
        if !self.state.links.contains_key(&event.id) && self.state.links.len() >= 2000 {
            return Err(DriverError::invalid_state("calendar_link_limit"));
        }
        let copy = projection(event)?;
        let previous = self
            .state
            .links
            .get(&event.id)
            .and_then(|link| link.external_id.as_deref());
        let external = self.driver.upsert(&copy, target_id, previous)?;
        let link = CalendarLink {
            event_id: event.id.clone(),
            target_id: target.id,
            target_title: target.title,
            external_id: Some(external),
            fingerprint: Some(hash(&copy)),
            error_code: None,
        };
        self.state.links.insert(event.id.clone(), link.clone());
        self.persist()?;
        Ok(link)
    }
    /// Detaching preserves the system copy; subsequent app edits no longer touch it.
    pub fn detach(&mut self, id: &str) -> DriverResult<()> {
        self.state.links.remove(id);
        self.persist()
    }
    pub fn reconcile(&mut self, events: &[CalendarEvent]) -> DriverResult<CalendarStatus> {
        if self.state.links.is_empty() {
            return self.status();
        }
        if self.state.provider.as_deref() != self.driver.provider() {
            return Err(invalid());
        }
        if self.support()?.authorization != Authorization::Granted {
            return Err(DriverError::invalid_state("calendar_permission_denied"));
        }
        for link in self.state.links.values_mut() {
            let result = (|| -> DriverResult<()> {
                if let Some(event) = events.iter().find(|event| event.id == link.event_id) {
                    let copy = projection(event)?;
                    let fingerprint = hash(&copy);
                    if link.fingerprint.as_ref() != Some(&fingerprint) || link.external_id.is_none()
                    {
                        let external = self.driver.upsert(
                            &copy,
                            &link.target_id,
                            link.external_id.as_deref(),
                        )?;
                        link.external_id = Some(external);
                        link.fingerprint = Some(fingerprint);
                    }
                } else if let Some(external) = &link.external_id {
                    self.driver.remove(&link.event_id, external)?;
                    link.external_id = None;
                    link.fingerprint = None;
                }
                Ok(())
            })();
            link.error_code = result.err().map(|error| error.code);
        }
        self.persist()?;
        self.status()
    }
}
