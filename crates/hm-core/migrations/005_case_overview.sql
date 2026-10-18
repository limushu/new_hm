ALTER TABLE proceedings ADD COLUMN parent_id TEXT REFERENCES proceedings(id) ON DELETE SET NULL;
ALTER TABLE proceedings ADD COLUMN state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','completed'));
ALTER TABLE proceedings ADD COLUMN completed_at TEXT;
ALTER TABLE case_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'milestone' CHECK(kind IN ('milestone','stage_change'));
UPDATE case_events SET kind='stage_change' WHERE title LIKE '切换阶段：%' AND notes='';
CREATE TABLE tag_catalog(name TEXT PRIMARY KEY);
CREATE TABLE case_tags(case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
 tag TEXT NOT NULL REFERENCES tag_catalog(name), PRIMARY KEY(case_id,tag));
INSERT INTO tag_catalog SELECT DISTINCT CASE case_type WHEN 'civil' THEN '民商事诉讼' ELSE '其他案件' END FROM cases;
INSERT INTO case_tags SELECT id, CASE case_type WHEN 'civil' THEN '民商事诉讼' ELSE '其他案件' END FROM cases;
PRAGMA user_version=5;
