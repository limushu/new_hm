CREATE TABLE case_statuses (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, position INTEGER NOT NULL
);
INSERT INTO case_statuses VALUES
  ('not_started','未开始','#96938b',0),
  ('in_progress','进行中','#7098b9',1),
  ('closed','已结案','#7e9b85',2);
CREATE TABLE cases (
  id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(trim(title))>0),
  case_type TEXT NOT NULL CHECK(case_type IN ('civil','other')),
  status_id TEXT NOT NULL REFERENCES case_statuses(id), current_proceeding_id TEXT,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE TABLE proceedings (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id),
  kind TEXT NOT NULL CHECK(kind IN ('first_instance','appeal','retrial','enforcement')),
  stage TEXT NOT NULL DEFAULT '', case_number TEXT NOT NULL DEFAULT '',
  court TEXT NOT NULL DEFAULT '', judge TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX proceedings_case_idx ON proceedings(case_id);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id),
  title TEXT NOT NULL CHECK(length(trim(title))>0), due_date TEXT,
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX tasks_case_idx ON tasks(case_id);
CREATE TABLE work_records (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id),
  body TEXT NOT NULL CHECK(length(trim(body))>0),
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX work_records_case_idx ON work_records(case_id);
PRAGMA user_version=1;
