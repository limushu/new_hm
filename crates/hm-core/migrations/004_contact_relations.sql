CREATE TABLE contact_relations (
 judge_id TEXT NOT NULL REFERENCES contacts(id),
 court_id TEXT NOT NULL REFERENCES contacts(id),
 PRIMARY KEY(judge_id,court_id), CHECK(judge_id<>court_id)
);
CREATE INDEX contact_relations_court_idx ON contact_relations(court_id);
PRAGMA user_version=4;
