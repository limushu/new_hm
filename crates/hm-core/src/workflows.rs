use crate::{
    people::{checked_text, valid_id},
    *,
};
use rusqlite::{params, OptionalExtension};

impl Store {
    pub fn workflow_templates(&self) -> Result<Vec<WorkflowTemplate>> {
        let rows = self.connection.prepare("SELECT id,name,category,stages_json FROM workflow_templates WHERE archived=0 ORDER BY rowid")?
            .query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,String>(1)?, r.get::<_,String>(2)?, r.get::<_,String>(3)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows.into_iter()
            .map(|(id, name, category, stages)| {
                Ok(WorkflowTemplate {
                    id,
                    name,
                    category,
                    stages: serde_json::from_str(&stages)?,
                })
            })
            .collect()
    }
    pub fn save_workflow_template(&self, input: WorkflowTemplate) -> Result<()> {
        let name = checked_text(&input.name, "模板名称", 80, true)?;
        if !["litigation", "non_litigation"].contains(&input.category.as_str())
            || input.stages.len() > 40
        {
            return Err(Error::Validation(
                "模板类别或阶段数量无效（最多 40 个阶段）".into(),
            ));
        }
        let stages: Vec<String> = input
            .stages
            .iter()
            .map(|n| checked_text(n, "阶段名称", 80, true))
            .collect::<Result<_>>()?;
        if stages
            .iter()
            .map(|n| n.to_lowercase())
            .collect::<std::collections::BTreeSet<_>>()
            .len()
            != stages.len()
        {
            return Err(Error::Validation("模板中的阶段名称不能重复".into()));
        }
        let exists: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM workflow_templates WHERE id=?1)",
            [&input.id],
            |r| r.get(0),
        )?;
        if !exists {
            valid_id(&input.id)?;
        }
        let duplicate: bool = self.connection.query_row("SELECT EXISTS(SELECT 1 FROM workflow_templates WHERE archived=0 AND name=?1 COLLATE NOCASE AND id<>?2)",params![name,input.id],|r|r.get(0))?;
        if duplicate {
            return Err(Error::Validation(
                "已有同名流程模板，请选择或编辑已有模板".into(),
            ));
        }
        self.connection.execute("INSERT INTO workflow_templates(id,name,category,stages_json) VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,stages_json=excluded.stages_json,archived=0",params![input.id,name,input.category,serde_json::to_string(&stages)?])?;
        Ok(())
    }
    pub fn delete_workflow_template(&self, id: &str) -> Result<()> {
        if self
            .connection
            .execute("UPDATE workflow_templates SET archived=1 WHERE id=?1", [id])?
            == 0
        {
            return Err(Error::NotFound);
        }
        Ok(())
    }
    pub fn rename_proceeding(&self, id: &str, name: &str) -> Result<()> {
        let name = checked_text(name, "流程名称", 80, true)?;
        let owner: String = self
            .connection
            .query_row("SELECT case_id FROM proceedings WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .optional()?
            .ok_or(Error::NotFound)?;
        self.active_case(&owner)?;
        self.connection.execute(
            "UPDATE proceedings SET name=?1 WHERE id=?2",
            params![name, id],
        )?;
        Ok(())
    }
}
