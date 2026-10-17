use crate::{CalendarEvent, Error, Result, Store};
use rusqlite::params;
use uuid::Uuid;

fn valid_date(value: &str) -> bool {
    value.len() == 10
        && chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .is_ok_and(|date| date.format("%Y-%m-%d").to_string() == value)
}

fn valid_time(value: &str) -> bool {
    value.len() == 5
        && chrono::NaiveTime::parse_from_str(value, "%H:%M")
            .is_ok_and(|time| time.format("%H:%M").to_string() == value)
}

impl Store {
    pub(crate) fn calendar_events(&self) -> Result<Vec<CalendarEvent>> {
        Ok(self
            .connection
            .prepare(
                "SELECT id,title,start_date,end_date,start_time,end_time,case_id,location,notes,reminder_minutes
             FROM calendar_events WHERE deleted_at IS NULL ORDER BY start_date,start_time,title,id",
            )?
            .query_map([], |row| {
                Ok(CalendarEvent {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    start_date: row.get(2)?,
                    end_date: row.get(3)?,
                    start_time: row.get(4)?,
                    end_time: row.get(5)?,
                    case_id: row.get(6)?,
                    location: row.get(7)?,
                    notes: row.get(8)?,
                    reminder_minutes: row.get(9)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn save_calendar_event(&self, input: CalendarEvent) -> Result<()> {
        Uuid::parse_str(&input.id).map_err(|_| Error::Validation("日程标识无效".into()))?;
        let title = input.title.trim();
        if title.is_empty() || title.chars().count() > 200 {
            return Err(Error::Validation(
                "日程名称不能为空，且不能超过200个字符".into(),
            ));
        }
        if !valid_date(&input.start_date)
            || !valid_date(&input.end_date)
            || input.end_date < input.start_date
        {
            return Err(Error::Validation(
                "日期无效，结束日期不能早于开始日期".into(),
            ));
        }
        match (&input.start_time, &input.end_time) {
            (None, None) => {}
            (Some(start), Some(end))
                if valid_time(start)
                    && valid_time(end)
                    && (input.end_date > input.start_date || end > start) => {}
            _ => {
                return Err(Error::Validation(
                    "时间无效，结束时间必须晚于开始时间".into(),
                ))
            }
        }
        if input
            .reminder_minutes
            .is_some_and(|m| ![0, 5, 10, 15, 30, 60, 1440, 10080].contains(&m))
        {
            return Err(Error::Validation("提醒时间无效".into()));
        }
        if input.location.chars().count() > 500 || input.notes.chars().count() > 20000 {
            return Err(Error::Validation("日程地点或备注长度超出限制".into()));
        }
        if let Some(id) = &input.case_id {
            self.active_case(id)?;
        }
        // Stable IDs make retries safe. A deleted event cannot be resurrected by a late save.
        let changed = self.connection.execute(
            "INSERT INTO calendar_events(id,title,start_date,end_date,start_time,end_time,case_id,location,notes,reminder_minutes)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title,start_date=excluded.start_date,
             end_date=excluded.end_date,start_time=excluded.start_time,end_time=excluded.end_time,
             case_id=excluded.case_id,location=excluded.location,notes=excluded.notes,reminder_minutes=excluded.reminder_minutes,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE calendar_events.deleted_at IS NULL AND (calendar_events.case_id IS NULL OR
               calendar_events.case_id IN (SELECT id FROM cases WHERE deleted_at IS NULL))",
            params![input.id,title,input.start_date,input.end_date,input.start_time,input.end_time,
                input.case_id,input.location.trim(),input.notes.trim(),input.reminder_minutes],
        )?;
        if changed == 0 {
            return Err(Error::NotFound);
        }
        Ok(())
    }

    pub fn delete_calendar_event(&self, id: &str) -> Result<()> {
        let changed = self.connection.execute(
            "UPDATE calendar_events SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id=?1 AND deleted_at IS NULL AND (case_id IS NULL OR
               case_id IN (SELECT id FROM cases WHERE deleted_at IS NULL))",
            [id],
        )?;
        if changed == 0 {
            return Err(Error::NotFound);
        }
        Ok(())
    }
}
