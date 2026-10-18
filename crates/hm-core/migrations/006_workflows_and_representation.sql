CREATE TABLE workflow_templates (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name))>0),
 category TEXT NOT NULL CHECK(category IN ('litigation','non_litigation')),
 stages_json TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1))
);
CREATE UNIQUE INDEX workflow_template_name_idx ON workflow_templates(name COLLATE NOCASE) WHERE archived=0;
INSERT INTO workflow_templates(id,name,category,stages_json) VALUES
 ('first_instance','一审','litigation','["材料准备","立案","举证","开庭","裁判"]'),
 ('appeal','二审','litigation','["材料准备","立案","举证","开庭","裁判"]'),
 ('retrial','再审','litigation','["材料准备","立案","举证","开庭","裁判"]'),
 ('enforcement','执行','litigation','["申请执行","执行立案","财产调查","执行措施","执行结果"]'),
 ('contract_review','合同审查','non_litigation','["需求确认","资料审阅","意见沟通","成果交付"]'),
 ('advisory','专项顾问','non_litigation','["委托确认","调查分析","方案沟通","成果交付"]');

-- foreign_keys is temporarily disabled by the migration runner, outside its
-- transaction. Rebuild removes the old fixed kind CHECK; all existing IDs and
-- every dependent record remain unchanged. Check all foreign keys before commit.
CREATE TABLE proceedings_v6 (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id),
 kind TEXT NOT NULL REFERENCES workflow_templates(id),
 name TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('litigation','non_litigation')),
 stage TEXT NOT NULL DEFAULT '', case_number TEXT NOT NULL DEFAULT '',
 court TEXT NOT NULL DEFAULT '', judge TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 parent_id TEXT REFERENCES proceedings(id) ON DELETE SET NULL,
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','completed')),
 completed_at TEXT
);
INSERT INTO proceedings_v6(id,case_id,kind,name,category,stage,case_number,court,judge,created_at,parent_id,state,completed_at)
 SELECT p.id,p.case_id,p.kind,t.name,t.category,p.stage,p.case_number,p.court,p.judge,p.created_at,p.parent_id,p.state,p.completed_at
 FROM proceedings p JOIN workflow_templates t ON t.id=p.kind;
DROP TABLE proceedings;
ALTER TABLE proceedings_v6 RENAME TO proceedings;
CREATE INDEX proceedings_case_idx ON proceedings(case_id);

CREATE TABLE case_parties (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
 contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
 name TEXT NOT NULL DEFAULT '', side TEXT NOT NULL CHECK(side IN ('client','opponent','other')),
 service_type TEXT NOT NULL DEFAULT ''
);
CREATE TABLE proceeding_party_roles (
 party_id TEXT NOT NULL REFERENCES case_parties(id) ON DELETE CASCADE,
 proceeding_id TEXT NOT NULL REFERENCES proceedings(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(length(trim(role))>0), PRIMARY KEY(party_id,proceeding_id)
);
ALTER TABLE contact_links ADD COLUMN party_id TEXT REFERENCES case_parties(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX contact_link_party_idx ON contact_links(party_id) WHERE party_id IS NOT NULL;
PRAGMA user_version=6;
