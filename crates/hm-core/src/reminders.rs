use crate::*;
use chrono::{NaiveDate, NaiveDateTime, NaiveTime, TimeDelta};
use rusqlite::params;

#[derive(Debug, Clone)]
pub struct ReminderTiming {
    pub when: NaiveDateTime,
    pub due: NaiveDateTime,
    pub schedule_key: String,
}
pub fn reminder_timing(event: &CalendarEvent) -> Result<Option<ReminderTiming>> {
    let Some(minutes) = event.reminder_minutes else {
        return Ok(None);
    };
    let date = NaiveDate::parse_from_str(&event.start_date, "%Y-%m-%d")
        .map_err(|_| Error::Validation("日程日期无效".into()))?;
    let time = NaiveTime::parse_from_str(event.start_time.as_deref().unwrap_or("09:00"), "%H:%M")
        .map_err(|_| Error::Validation("日程时间无效".into()))?;
    let when = date.and_time(time);
    let due = when
        .checked_sub_signed(TimeDelta::minutes(minutes))
        .ok_or_else(|| Error::Validation("提醒时间无效".into()))?;
    Ok(Some(ReminderTiming {
        when,
        due,
        schedule_key: format!(
            "{}|{}|{minutes}",
            event.start_date,
            event.start_time.as_deref().unwrap_or("09:00")
        ),
    }))
}

impl Store {
    pub fn device_calendar_events(&self) -> Result<Vec<CalendarEvent>> {
        Ok(self
            .calendar_events()?
            .into_iter()
            .filter(|event| {
                event
                    .case_id
                    .as_ref()
                    .is_none_or(|id| self.active_case(id).is_ok())
            })
            .collect())
    }

    pub fn due_reminders(&self, now: NaiveDateTime) -> Result<Vec<Reminder>> {
        let mut result = vec![];
        for event in self.calendar_events()? {
            if event
                .case_id
                .as_ref()
                .is_some_and(|id| self.active_case(id).is_err())
            {
                continue;
            }
            let Some(timing) = reminder_timing(&event)? else {
                continue;
            };
            let ReminderTiming {
                when,
                due,
                schedule_key: key,
            } = timing;
            if due > now || now - due > TimeDelta::hours(24) {
                continue;
            }
            let delivered:bool=self.connection.query_row("SELECT EXISTS(SELECT 1 FROM reminder_deliveries WHERE event_id=?1 AND schedule_key=?2)",params![event.id,key],|r|r.get(0))?;
            if !delivered {
                result.push(Reminder {
                    event_id: event.id,
                    title: event.title,
                    schedule_key: key,
                    when: when.format("%m月%d日 %H:%M").to_string(),
                });
            }
        }
        Ok(result)
    }
    pub fn acknowledge_reminder(&self, event_id: &str, key: &str) -> Result<()> {
        if !self
            .calendar_events()?
            .iter()
            .any(|event| event.id == event_id)
        {
            return Err(Error::NotFound);
        }
        self.connection.execute(
            "INSERT OR IGNORE INTO reminder_deliveries(event_id,schedule_key) VALUES(?1,?2)",
            params![event_id, key],
        )?;
        Ok(())
    }
}
