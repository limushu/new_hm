use crate::people::{checked_text, valid_id};
use crate::*;
use rusqlite::{params, OptionalExtension};
impl Store {
    pub fn save_record(&self, input: RecordInput) -> Result<()> {
        valid_id(&input.id)?;
        self.active_case(&input.case_id)?;
        let body = checked_text(&input.body, "工作记录", 20000, true)?;
        let existing: Option<(String, Option<String>)> = self
            .connection
            .query_row(
                "SELECT case_id,deleted_at FROM work_records WHERE id=?1",
                [&input.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        if existing.is_some_and(|(owner, deleted)| owner != input.case_id || deleted.is_some()) {
            return Err(Error::NotFound);
        }
        self.connection.execute("INSERT INTO work_records(id,case_id,body) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET body=excluded.body",params![input.id,input.case_id,body])?;
        Ok(())
    }
    pub fn deleted_records(&self) -> Result<Vec<WorkRecord>> {
        Ok(self.connection.prepare("SELECT id,case_id,body,created_at FROM work_records WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC")?.query_map([],|r|Ok(WorkRecord{id:r.get(0)?,case_id:r.get(1)?,body:r.get(2)?,created_at:r.get(3)?}))?.collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn trash_item(&mut self, kind: &str, id: &str) -> Result<()> {
        match kind {
            "case" => self.trash_case(id),
            "record" => {
                let owner: String = self
                    .connection
                    .query_row(
                        "SELECT case_id FROM work_records WHERE id=?1 AND deleted_at IS NULL",
                        [id],
                        |r| r.get(0),
                    )
                    .optional()?
                    .ok_or(Error::NotFound)?;
                self.active_case(&owner)?;
                self.connection.execute("UPDATE work_records SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1",[id])?;
                Ok(())
            }
            "material" => {
                self.material(id)?;
                let ids = self.descendant_ids(id)?;
                let tx = self.connection.transaction()?;
                for child in ids {
                    tx.execute("UPDATE materials SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),trash_group=?1 WHERE id=?2 AND deleted_at IS NULL",params![id,child])?;
                }
                tx.commit()?;
                Ok(())
            }
            _ => Err(Error::Validation("回收类型无效".into())),
        }
    }
    pub fn restore_item(&mut self, kind: &str, id: &str) -> Result<()> {
        match kind {
            "case" => self.restore_case(id),
            "record" => {
                let owner: String = self
                    .connection
                    .query_row(
                        "SELECT case_id FROM work_records WHERE id=?1 AND deleted_at IS NOT NULL",
                        [id],
                        |r| r.get(0),
                    )
                    .optional()?
                    .ok_or(Error::NotFound)?;
                self.active_case(&owner)?;
                self.connection
                    .execute("UPDATE work_records SET deleted_at=NULL WHERE id=?1", [id])?;
                Ok(())
            }
            "material" => {
                let item = self
                    .materials()?
                    .into_iter()
                    .find(|m| {
                        m.id == id && m.deleted_at.is_some() && m.trash_group.as_deref() == Some(id)
                    })
                    .ok_or(Error::NotFound)?;
                self.active_case(&item.case_id)?;
                if let Some(parent) = &item.parent_id {
                    self.material(parent)
                        .map_err(|_| Error::Validation("请先恢复上级文件夹".into()))?;
                }
                let target = MaterialTarget {
                    stage_id: None,
                    case_id: item.case_id,
                    proceeding_id: item.proceeding_id,
                    parent_id: item.parent_id,
                    record_id: None,
                };
                let name = self.unique_name(&target, &item.name, Some(id))?;
                let tx = self.connection.transaction()?;
                tx.execute(
                    "UPDATE materials SET name=?1 WHERE id=?2",
                    params![name, id],
                )?;
                tx.execute(
                    "UPDATE materials SET deleted_at=NULL,trash_group=NULL WHERE trash_group=?1",
                    [id],
                )?;
                tx.commit()?;
                Ok(())
            }
            _ => Err(Error::Validation("回收类型无效".into())),
        }
    }
    pub fn purge_item(&mut self, kind: &str, id: &str, confirmed: bool) -> Result<()> {
        if !confirmed {
            return Err(Error::Validation("彻底删除前需要确认".into()));
        }
        let mut objects = vec![];
        match kind {
            "record" => {
                let owner: String = self
                    .connection
                    .query_row(
                        "SELECT case_id FROM work_records WHERE id=?1 AND deleted_at IS NOT NULL",
                        [id],
                        |r| r.get(0),
                    )
                    .optional()?
                    .ok_or(Error::NotFound)?;
                self.active_case(&owner)?;
                let tx = self.connection.transaction()?;
                tx.execute(
                    "UPDATE materials SET record_id=NULL WHERE record_id=?1",
                    [id],
                )?;
                tx.execute("DELETE FROM work_records WHERE id=?1", [id])?;
                tx.commit()?;
            }
            "material" => {
                let item = self
                    .materials()?
                    .into_iter()
                    .find(|m| {
                        m.id == id && m.deleted_at.is_some() && m.trash_group.as_deref() == Some(id)
                    })
                    .ok_or(Error::NotFound)?;
                self.active_case(&item.case_id)?;
                let mut ids = self.descendant_ids(id)?;
                ids.reverse();
                for child in &ids {
                    if let Ok(path) = self.object_dir(&item.case_id, child, false) {
                        objects.push(path);
                    }
                }
                let tx = self.connection.transaction()?;
                for child in &ids {
                    tx.execute(
                        "UPDATE ledger_entries SET material_id=NULL WHERE material_id=?1",
                        [child],
                    )?;
                }
                // A recursive depth order avoids deleting parents before their foreign-key children.
                tx.execute("UPDATE materials SET parent_id=NULL WHERE id IN (WITH RECURSIVE t(id) AS (SELECT id FROM materials WHERE id=?1 UNION SELECT m.id FROM materials m JOIN t ON m.parent_id=t.id) SELECT id FROM t)",[id])?;
                for child in ids {
                    tx.execute("DELETE FROM materials WHERE id=?1", [child])?;
                }
                tx.commit()?;
            }
            "case" => {
                let deleted: bool = self
                    .connection
                    .query_row(
                        "SELECT deleted_at IS NOT NULL FROM cases WHERE id=?1",
                        [id],
                        |r| r.get(0),
                    )
                    .optional()?
                    .ok_or(Error::NotFound)?;
                if !deleted {
                    return Err(Error::Validation("请先将案件移入回收站".into()));
                }
                for item in self
                    .materials()?
                    .into_iter()
                    .filter(|m| m.case_id == id && m.kind == "file")
                {
                    if let Ok(path) = self.object_dir(id, &item.id, false) {
                        objects.push(path);
                    }
                }
                let tx = self.connection.transaction()?;
                tx.execute("DELETE FROM reminder_deliveries WHERE event_id IN (SELECT id FROM calendar_events WHERE case_id=?1)",[id])?;
                tx.execute("DELETE FROM calendar_events WHERE case_id=?1", [id])?;
                tx.execute("DELETE FROM contact_links WHERE case_id=?1", [id])?;
                tx.execute("DELETE FROM ledger_entries WHERE case_id=?1", [id])?;
                tx.execute(
                    "UPDATE materials SET parent_id=NULL,record_id=NULL WHERE case_id=?1",
                    [id],
                )?;
                tx.execute("DELETE FROM materials WHERE case_id=?1", [id])?;
                tx.execute(
                    "UPDATE case_details SET related_case_id=NULL WHERE related_case_id=?1",
                    [id],
                )?;
                tx.execute("DELETE FROM case_details WHERE case_id=?1", [id])?;
                tx.execute("DELETE FROM case_events WHERE case_id=?1", [id])?;
                tx.execute("DELETE FROM stages WHERE proceeding_id IN (SELECT id FROM proceedings WHERE case_id=?1)",[id])?;
                tx.execute("DELETE FROM work_records WHERE case_id=?1", [id])?;
                tx.execute("DELETE FROM tasks WHERE case_id=?1", [id])?;
                tx.execute("DELETE FROM proceedings WHERE case_id=?1", [id])?;
                tx.execute("DELETE FROM cases WHERE id=?1", [id])?;
                tx.commit()?;
            }
            _ => return Err(Error::Validation("回收类型无效".into())),
        }
        if let Ok(root) = self.material_root() {
            for object in objects {
                if object.starts_with(&root) && object != root {
                    let _ = std::fs::remove_dir_all(object);
                }
            }
        }
        Ok(())
    }
}
