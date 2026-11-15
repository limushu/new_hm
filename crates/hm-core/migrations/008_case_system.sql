-- Shared annotations and references, never copies of resource bodies or money.
CREATE TABLE resource_metadata (
 case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
 resource_kind TEXT NOT NULL,
 resource_id TEXT NOT NULL,
 importance TEXT NOT NULL DEFAULT 'normal' CHECK(importance IN ('normal','important')),
 tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json) AND json_type(tags_json)='array'),
 PRIMARY KEY(case_id,resource_kind,resource_id)
);
CREATE TABLE resource_relations (
 id TEXT PRIMARY KEY,
 case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
 source_kind TEXT NOT NULL,
 source_id TEXT NOT NULL,
 target_kind TEXT NOT NULL,
 target_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 label TEXT NOT NULL DEFAULT '',
 CHECK(source_kind!=target_kind OR source_id!=target_id),
 UNIQUE(case_id,source_kind,source_id,target_kind,target_id,kind)
);
CREATE INDEX resource_relation_source ON resource_relations(case_id,source_kind,source_id);
CREATE INDEX resource_relation_target ON resource_relations(case_id,target_kind,target_id);
CREATE TRIGGER cleanup_proceeding_resource AFTER DELETE ON proceedings BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='proceeding' AND resource_id=old.id;
 DELETE FROM resource_relations WHERE (source_kind='proceeding' AND source_id=old.id) OR (target_kind='proceeding' AND target_id=old.id);
END;
CREATE TRIGGER detach_proceeding_resource AFTER UPDATE OF case_id ON proceedings WHEN old.case_id IS NOT new.case_id BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='proceeding' AND resource_id=new.id AND case_id IS NOT new.case_id;
 DELETE FROM resource_relations WHERE ((source_kind='proceeding' AND source_id=new.id) OR (target_kind='proceeding' AND target_id=new.id)) AND case_id IS NOT new.case_id;
END;
CREATE TRIGGER cleanup_milestone_resource AFTER DELETE ON case_events BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='milestone' AND resource_id=old.id;
 DELETE FROM resource_relations WHERE (source_kind='milestone' AND source_id=old.id) OR (target_kind='milestone' AND target_id=old.id);
END;
CREATE TRIGGER detach_milestone_resource AFTER UPDATE OF case_id ON case_events WHEN old.case_id IS NOT new.case_id BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='milestone' AND resource_id=new.id AND case_id IS NOT new.case_id;
 DELETE FROM resource_relations WHERE ((source_kind='milestone' AND source_id=new.id) OR (target_kind='milestone' AND target_id=new.id)) AND case_id IS NOT new.case_id;
END;
CREATE TRIGGER cleanup_event_resource AFTER DELETE ON calendar_events BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='event' AND resource_id=old.id;
 DELETE FROM resource_relations WHERE (source_kind='event' AND source_id=old.id) OR (target_kind='event' AND target_id=old.id);
END;
CREATE TRIGGER detach_event_resource AFTER UPDATE OF case_id ON calendar_events WHEN old.case_id IS NOT new.case_id BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='event' AND resource_id=new.id AND case_id IS NOT new.case_id;
 DELETE FROM resource_relations WHERE ((source_kind='event' AND source_id=new.id) OR (target_kind='event' AND target_id=new.id)) AND case_id IS NOT new.case_id;
END;
CREATE TRIGGER cleanup_task_resource AFTER DELETE ON tasks BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='task' AND resource_id=old.id;
 DELETE FROM resource_relations WHERE (source_kind='task' AND source_id=old.id) OR (target_kind='task' AND target_id=old.id);
END;
CREATE TRIGGER detach_task_resource AFTER UPDATE OF case_id ON tasks WHEN old.case_id IS NOT new.case_id BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='task' AND resource_id=new.id AND case_id IS NOT new.case_id;
 DELETE FROM resource_relations WHERE ((source_kind='task' AND source_id=new.id) OR (target_kind='task' AND target_id=new.id)) AND case_id IS NOT new.case_id;
END;
CREATE TRIGGER cleanup_record_resource AFTER DELETE ON work_records BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='record' AND resource_id=old.id;
 DELETE FROM resource_relations WHERE (source_kind='record' AND source_id=old.id) OR (target_kind='record' AND target_id=old.id);
END;
CREATE TRIGGER detach_record_resource AFTER UPDATE OF case_id ON work_records WHEN old.case_id IS NOT new.case_id BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='record' AND resource_id=new.id AND case_id IS NOT new.case_id;
 DELETE FROM resource_relations WHERE ((source_kind='record' AND source_id=new.id) OR (target_kind='record' AND target_id=new.id)) AND case_id IS NOT new.case_id;
END;
CREATE TRIGGER cleanup_material_resource AFTER DELETE ON materials BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='material' AND resource_id=old.id;
 DELETE FROM resource_relations WHERE (source_kind='material' AND source_id=old.id) OR (target_kind='material' AND target_id=old.id);
END;
CREATE TRIGGER detach_material_resource AFTER UPDATE OF case_id ON materials WHEN old.case_id IS NOT new.case_id BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='material' AND resource_id=new.id AND case_id IS NOT new.case_id;
 DELETE FROM resource_relations WHERE ((source_kind='material' AND source_id=new.id) OR (target_kind='material' AND target_id=new.id)) AND case_id IS NOT new.case_id;
END;
CREATE TRIGGER cleanup_ledger_resource AFTER DELETE ON ledger_entries BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='ledger' AND resource_id=old.id;
 DELETE FROM resource_relations WHERE (source_kind='ledger' AND source_id=old.id) OR (target_kind='ledger' AND target_id=old.id);
END;
CREATE TRIGGER detach_ledger_resource AFTER UPDATE OF case_id ON ledger_entries WHEN old.case_id IS NOT new.case_id BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='ledger' AND resource_id=new.id AND case_id IS NOT new.case_id;
 DELETE FROM resource_relations WHERE ((source_kind='ledger' AND source_id=new.id) OR (target_kind='ledger' AND target_id=new.id)) AND case_id IS NOT new.case_id;
END;
CREATE TRIGGER cleanup_party_resource AFTER DELETE ON case_parties BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='party' AND resource_id=old.id;
 DELETE FROM resource_relations WHERE (source_kind='party' AND source_id=old.id) OR (target_kind='party' AND target_id=old.id);
END;
CREATE TRIGGER detach_party_resource AFTER UPDATE OF case_id ON case_parties WHEN old.case_id IS NOT new.case_id BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='party' AND resource_id=new.id AND case_id IS NOT new.case_id;
 DELETE FROM resource_relations WHERE ((source_kind='party' AND source_id=new.id) OR (target_kind='party' AND target_id=new.id)) AND case_id IS NOT new.case_id;
END;
CREATE TRIGGER cleanup_contact_resource AFTER DELETE ON contacts BEGIN
 DELETE FROM resource_metadata WHERE resource_kind='contact' AND resource_id=old.id;
 DELETE FROM resource_relations WHERE (source_kind='contact' AND source_id=old.id) OR (target_kind='contact' AND target_id=old.id);
END;
PRAGMA user_version=8;
