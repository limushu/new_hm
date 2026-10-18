use crate::*;
use rusqlite::{params, Connection, OptionalExtension};

pub(crate) fn normalized_tags(tags: &[String]) -> Result<Vec<String>> {
    if tags.len() > 12 {
        return Err(Error::Validation("每个案件最多 12 个标签".into()));
    }
    let mut result = std::collections::BTreeSet::new();
    for tag in tags {
        let name = tag.trim().trim_start_matches('#').to_lowercase();
        if name.is_empty()
            || name.chars().count() > 30
            || name
                .chars()
                .any(|c| c.is_whitespace() || c == '#' || c.is_control())
        {
            return Err(Error::Validation("标签限 1–30 字，不能含空格或 #".into()));
        }
        result.insert(name);
    }
    Ok(result.into_iter().collect())
}
pub(crate) fn write_tags(db: &Connection, case_id: &str, tags: &[String]) -> Result<()> {
    db.execute("DELETE FROM case_tags WHERE case_id=?1", [case_id])?;
    for tag in tags {
        db.execute("INSERT OR IGNORE INTO tag_catalog(name) VALUES(?1)", [tag])?;
        db.execute(
            "INSERT INTO case_tags(case_id,tag) VALUES(?1,?2)",
            params![case_id, tag],
        )?;
    }
    Ok(())
}
impl Store {
    pub fn update_proceeding_meta(&mut self, input: ProceedingMeta) -> Result<()> {
        let owner: String = self
            .connection
            .query_row(
                "SELECT case_id FROM proceedings WHERE id=?1",
                [&input.id],
                |r| r.get(0),
            )
            .optional()?
            .ok_or(Error::NotFound)?;
        self.active_case(&owner)?;
        if !["active", "completed"].contains(&input.state.as_str()) {
            return Err(Error::Validation("程序状态无效".into()));
        }
        if let Some(parent) = &input.parent_id {
            let same_case: bool = self.connection.query_row(
                "SELECT EXISTS(SELECT 1 FROM proceedings WHERE id=?1 AND case_id=?2)",
                params![parent, owner],
                |r| r.get(0),
            )?;
            if !same_case {
                return Err(Error::Validation("前序程序必须属于同一案件".into()));
            }
            let cycle: bool = self.connection.query_row("WITH RECURSIVE ancestors(id,parent_id) AS (SELECT id,parent_id FROM proceedings WHERE id=?1 UNION SELECT p.id,p.parent_id FROM proceedings p JOIN ancestors a ON p.id=a.parent_id) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id=?2)", params![parent,input.id], |r| r.get(0))?;
            if cycle {
                return Err(Error::Validation("程序承接关系不能形成循环".into()));
            }
        }
        let tx = self.connection.transaction()?;
        tx.execute("UPDATE proceedings SET parent_id=?1,state=?2,completed_at=CASE WHEN ?2='completed' THEN coalesce(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE NULL END WHERE id=?3", params![input.parent_id,input.state,input.id])?;
        if input.state == "completed" {
            tx.execute("UPDATE cases SET current_proceeding_id=NULL WHERE id=?1 AND current_proceeding_id=?2", params![owner,input.id])?;
        }
        tx.commit()?;
        Ok(())
    }
}
