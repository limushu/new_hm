use crate::people::{checked_date, checked_text, valid_id};
use crate::*;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;
impl Store {
    pub fn stages(&self) -> Result<Vec<Stage>> {
        Ok(self.connection.prepare("SELECT id,proceeding_id,name,position,state FROM stages ORDER BY proceeding_id,position,id")?.query_map([],|r|Ok(Stage{id:r.get(0)?,proceeding_id:r.get(1)?,name:r.get(2)?,position:r.get(3)?,state:r.get(4)?}))?.collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn case_events(&self) -> Result<Vec<CaseEvent>> {
        Ok(self.connection.prepare("SELECT id,case_id,proceeding_id,title,event_date,notes FROM case_events ORDER BY event_date DESC,created_at DESC,id")?.query_map([],|r|Ok(CaseEvent{id:r.get(0)?,case_id:r.get(1)?,proceeding_id:r.get(2)?,title:r.get(3)?,event_date:r.get(4)?,notes:r.get(5)?}))?.collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn save_stage(&mut self, input: Stage) -> Result<()> {
        let owner: String = self
            .connection
            .query_row(
                "SELECT case_id FROM proceedings WHERE id=?1",
                [&input.proceeding_id],
                |r| r.get(0),
            )
            .optional()?
            .ok_or(Error::NotFound)?;
        self.active_case(&owner)?;
        let name = checked_text(&input.name, "阶段名称", 80, true)?;
        if !["pending", "current", "done", "skipped"].contains(&input.state.as_str())
            || input.position < 0
            || input.position > 10000
        {
            return Err(Error::Validation("阶段状态或位置无效".into()));
        }
        let previous: Option<(String, String)> = self
            .connection
            .query_row(
                "SELECT proceeding_id,state FROM stages WHERE id=?1",
                [&input.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        if let Some((id, _)) = &previous {
            if id != &input.proceeding_id {
                return Err(Error::Validation("阶段不属于当前程序".into()));
            }
        } else {
            valid_id(&input.id)?;
        }
        let tx = self.connection.transaction()?;
        if input.state == "current" {
            tx.execute("UPDATE stages SET state='done' WHERE proceeding_id=?1 AND state='current' AND id<>?2",params![input.proceeding_id,input.id])?;
        }
        tx.execute("INSERT INTO stages(id,proceeding_id,name,position,state) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position,state=excluded.state",params![input.id,input.proceeding_id,name,input.position,input.state])?;
        if input.state == "current" {
            tx.execute(
                "UPDATE proceedings SET stage=?1 WHERE id=?2",
                params![name, input.proceeding_id],
            )?;
            if previous
                .as_ref()
                .is_none_or(|(_, state)| state != "current")
            {
                tx.execute("INSERT INTO case_events(id,case_id,proceeding_id,title,event_date) VALUES(?1,?2,?3,?4,date('now','localtime'))",params![Uuid::new_v4().to_string(),owner,input.proceeding_id,format!("切换阶段：{name}")])?;
            }
        } else if previous.is_some_and(|(_, state)| state == "current") {
            tx.execute(
                "UPDATE proceedings SET stage='' WHERE id=?1",
                [&input.proceeding_id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn reorder_stages(&mut self, proceeding_id: &str, ids: &[String]) -> Result<()> {
        let owner: String = self
            .connection
            .query_row(
                "SELECT case_id FROM proceedings WHERE id=?1",
                [proceeding_id],
                |r| r.get(0),
            )
            .optional()?
            .ok_or(Error::NotFound)?;
        self.active_case(&owner)?;
        let existing = self
            .stages()?
            .into_iter()
            .filter(|s| s.proceeding_id == proceeding_id)
            .map(|s| s.id)
            .collect::<std::collections::BTreeSet<_>>();
        let provided = ids
            .iter()
            .cloned()
            .collect::<std::collections::BTreeSet<_>>();
        if existing != provided || provided.len() != ids.len() {
            return Err(Error::Validation("排序必须包含此程序的全部阶段".into()));
        }
        let tx = self.connection.transaction()?;
        for (position, id) in ids.iter().enumerate() {
            tx.execute(
                "UPDATE stages SET position=?1 WHERE id=?2",
                params![position as i64, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn delete_stage(&self, id: &str) -> Result<()> {
        let stage = self
            .stages()?
            .into_iter()
            .find(|s| s.id == id)
            .ok_or(Error::NotFound)?;
        let owner: String = self.connection.query_row(
            "SELECT case_id FROM proceedings WHERE id=?1",
            [&stage.proceeding_id],
            |r| r.get(0),
        )?;
        self.active_case(&owner)?;
        if stage.state == "current" {
            return Err(Error::Validation("请先切换到其他阶段".into()));
        }
        self.connection
            .execute("DELETE FROM stages WHERE id=?1", [id])?;
        Ok(())
    }
    pub fn save_case_event(&self, input: CaseEvent) -> Result<()> {
        valid_id(&input.id)?;
        self.validate_proceeding(&input.case_id, input.proceeding_id.as_deref())?;
        checked_date(&input.event_date)?;
        let title = checked_text(&input.title, "事件名称", 200, true)?;
        let notes = checked_text(&input.notes, "事件说明", 20000, false)?;
        let owner: Option<String> = self
            .connection
            .query_row(
                "SELECT case_id FROM case_events WHERE id=?1",
                [&input.id],
                |r| r.get(0),
            )
            .optional()?;
        if owner.is_some_and(|id| id != input.case_id) {
            return Err(Error::Validation("事件不属于此案件".into()));
        }
        self.connection.execute("INSERT INTO case_events(id,case_id,proceeding_id,title,event_date,notes) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET proceeding_id=excluded.proceeding_id,title=excluded.title,event_date=excluded.event_date,notes=excluded.notes",params![input.id,input.case_id,input.proceeding_id,title,input.event_date,notes])?;
        Ok(())
    }
}

pub(crate) fn seed_default_stages(
    connection: &rusqlite::Connection,
    proceeding_id: &str,
    kind: &str,
) -> Result<()> {
    let names = if kind == "enforcement" {
        vec!["申请执行", "执行立案", "财产调查", "执行措施", "执行结果"]
    } else {
        vec!["材料准备", "立案", "举证", "开庭", "裁判"]
    };
    for (position, name) in names.iter().enumerate() {
        connection.execute(
            "INSERT INTO stages(id,proceeding_id,name,position,state) VALUES(?1,?2,?3,?4,?5)",
            params![
                Uuid::new_v4().to_string(),
                proceeding_id,
                name,
                position as i64,
                if position == 0 { "current" } else { "pending" }
            ],
        )?;
    }
    connection.execute(
        "UPDATE proceedings SET stage=?1 WHERE id=?2",
        params![names[0], proceeding_id],
    )?;
    Ok(())
}
