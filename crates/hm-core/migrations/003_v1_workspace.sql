CREATE TABLE materials (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id),
 proceeding_id TEXT REFERENCES proceedings(id), parent_id TEXT REFERENCES materials(id),
 name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('file','folder')),
 storage_name TEXT, size INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '',
 record_id TEXT REFERENCES work_records(id),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 deleted_at TEXT, trash_group TEXT
);
CREATE INDEX materials_case_idx ON materials(case_id,parent_id);
CREATE TABLE contacts (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('person','organization','court','judge')),
 phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE contact_links (
 id TEXT PRIMARY KEY, contact_id TEXT NOT NULL REFERENCES contacts(id), case_id TEXT NOT NULL REFERENCES cases(id),
 proceeding_id TEXT REFERENCES proceedings(id), role TEXT NOT NULL
);
CREATE INDEX contact_links_case_idx ON contact_links(case_id);
CREATE TABLE ledger_entries (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), proceeding_id TEXT REFERENCES proceedings(id),
 kind TEXT NOT NULL CHECK(kind IN ('income','expense')), amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 entry_date TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 reimbursement TEXT NOT NULL DEFAULT 'none' CHECK(reimbursement IN ('none','pending','received')),
 material_id TEXT REFERENCES materials(id),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE case_details (
 case_id TEXT PRIMARY KEY REFERENCES cases(id), agreed_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK(agreed_fee_cents>=0),
 related_case_id TEXT REFERENCES cases(id), notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE stages (
 id TEXT PRIMARY KEY, proceeding_id TEXT NOT NULL REFERENCES proceedings(id), name TEXT NOT NULL,
 position INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','current','done','skipped'))
);
CREATE TABLE case_events (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), proceeding_id TEXT REFERENCES proceedings(id),
 title TEXT NOT NULL, event_date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
ALTER TABLE work_records ADD COLUMN deleted_at TEXT;
ALTER TABLE calendar_events ADD COLUMN reminder_minutes INTEGER;
CREATE TABLE reminder_deliveries (
 event_id TEXT NOT NULL REFERENCES calendar_events(id), schedule_key TEXT NOT NULL,
 delivered_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(event_id,schedule_key)
);
INSERT INTO stages(id,proceeding_id,name,position,state)
 SELECT lower(hex(randomblob(16))),id,'材料准备',0,CASE WHEN stage='' OR stage='材料准备' THEN 'current' ELSE 'done' END FROM proceedings;
INSERT INTO stages(id,proceeding_id,name,position,state)
 SELECT lower(hex(randomblob(16))),id,'立案',1,CASE WHEN stage='立案' THEN 'current' ELSE 'pending' END FROM proceedings;
INSERT INTO stages(id,proceeding_id,name,position,state)
 SELECT lower(hex(randomblob(16))),id,'举证',2,CASE WHEN stage='举证' THEN 'current' ELSE 'pending' END FROM proceedings;
INSERT INTO stages(id,proceeding_id,name,position,state)
 SELECT lower(hex(randomblob(16))),id,'开庭',3,CASE WHEN stage='开庭' THEN 'current' ELSE 'pending' END FROM proceedings;
INSERT INTO stages(id,proceeding_id,name,position,state)
 SELECT lower(hex(randomblob(16))),id,'裁判',4,CASE WHEN stage='裁判' THEN 'current' ELSE 'pending' END FROM proceedings;
INSERT INTO stages(id,proceeding_id,name,position,state)
 SELECT lower(hex(randomblob(16))),id,stage,5,'current' FROM proceedings WHERE stage NOT IN ('','材料准备','立案','举证','开庭','裁判');
UPDATE proceedings SET stage='材料准备' WHERE stage='';
PRAGMA user_version=3;
