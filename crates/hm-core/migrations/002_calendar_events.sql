-- Dates/times are local wall-clock values, not UTC instants. All-day date ranges
-- are inclusive; timed ranges end exclusively. Both times are NULL for all-day.
CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL CHECK(end_date >= start_date),
  start_time TEXT,
  end_time TEXT,
  case_id TEXT REFERENCES cases(id),
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  CHECK((start_time IS NULL AND end_time IS NULL) OR
        (start_time IS NOT NULL AND end_time IS NOT NULL))
);
CREATE INDEX calendar_events_dates_idx ON calendar_events(start_date, end_date);
CREATE INDEX calendar_events_case_idx ON calendar_events(case_id);
PRAGMA user_version=2;
