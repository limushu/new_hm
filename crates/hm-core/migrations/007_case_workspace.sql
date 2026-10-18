-- Work references describe use; the original record remains owned by its case.
CREATE TABLE work_links (
 id TEXT PRIMARY KEY,
 case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
 proceeding_id TEXT NOT NULL REFERENCES proceedings(id) ON DELETE CASCADE,
 stage_id TEXT REFERENCES stages(id) ON DELETE SET NULL,
 kind TEXT NOT NULL CHECK(kind IN ('task','event','material','record','ledger')),
 resource_id TEXT NOT NULL,
 label TEXT NOT NULL DEFAULT ''
);
-- Nullable stage references may converge when a stage is deleted. Keep the
-- individual usage labels instead of rejecting the stage deletion.
CREATE UNIQUE INDEX work_link_scope ON work_links(kind,resource_id,proceeding_id,stage_id) WHERE stage_id IS NOT NULL;
CREATE UNIQUE INDEX work_link_single ON work_links(kind,resource_id) WHERE kind!='material';
CREATE INDEX work_link_stage ON work_links(stage_id);
CREATE TABLE task_work (
 task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
 waiting_for TEXT NOT NULL DEFAULT '',
 outcome TEXT NOT NULL DEFAULT ''
);
CREATE TABLE fee_plans (
 id TEXT PRIMARY KEY,
 case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
 proceeding_id TEXT REFERENCES proceedings(id) ON DELETE SET NULL,
 stage_id TEXT REFERENCES stages(id) ON DELETE SET NULL,
 title TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 due_date TEXT,
 condition TEXT NOT NULL DEFAULT '',
 ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1))
);
CREATE TABLE fee_allocations (
 plan_id TEXT NOT NULL REFERENCES fee_plans(id) ON DELETE CASCADE,
 ledger_id TEXT NOT NULL REFERENCES ledger_entries(id) ON DELETE CASCADE,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 PRIMARY KEY(plan_id,ledger_id)
);
-- Legacy zero cannot tell an unfilled agreement from a deliberately free service.
CREATE TABLE fee_agreement_confirmation (
 case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE
);
INSERT INTO fee_agreement_confirmation SELECT case_id FROM case_details WHERE agreed_fee_cents>0;
CREATE TRIGGER cleanup_task_work_link AFTER DELETE ON tasks BEGIN DELETE FROM work_links WHERE kind='task' AND resource_id=old.id; END;
CREATE TRIGGER cleanup_event_work_link AFTER DELETE ON calendar_events BEGIN DELETE FROM work_links WHERE kind='event' AND resource_id=old.id; END;
CREATE TRIGGER cleanup_material_work_link AFTER DELETE ON materials BEGIN DELETE FROM work_links WHERE kind='material' AND resource_id=old.id; END;
CREATE TRIGGER cleanup_record_work_link AFTER DELETE ON work_records BEGIN DELETE FROM work_links WHERE kind='record' AND resource_id=old.id; END;
CREATE TRIGGER cleanup_ledger_work_link AFTER DELETE ON ledger_entries BEGIN DELETE FROM work_links WHERE kind='ledger' AND resource_id=old.id; END;
CREATE TRIGGER detach_moved_event AFTER UPDATE OF case_id ON calendar_events BEGIN DELETE FROM work_links WHERE kind='event' AND resource_id=new.id AND case_id IS NOT new.case_id; END;
CREATE TRIGGER detach_moved_ledger AFTER UPDATE OF proceeding_id ON ledger_entries BEGIN DELETE FROM work_links WHERE kind='ledger' AND resource_id=new.id AND proceeding_id IS NOT new.proceeding_id; END;
PRAGMA user_version=7;
