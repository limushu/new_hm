use super::{invalid, valid_code, ResourceRef, ResourceRelation, ResourceResolver};
use crate::{Result, Store};
use rusqlite::{params, OptionalExtension};

impl Store {
    pub fn resource_relations(&self) -> Result<Vec<ResourceRelation>> {
        Ok(self.connection.prepare("SELECT id,case_id,source_kind,source_id,target_kind,target_id,kind,label FROM resource_relations ORDER BY case_id,id")?
            .query_map([], |r| Ok(ResourceRelation {id:r.get(0)?,case_id:r.get(1)?,source:ResourceRef{kind:r.get(2)?,id:r.get(3)?},target:ResourceRef{kind:r.get(4)?,id:r.get(5)?},kind:r.get(6)?,label:r.get(7)?}))?
            .collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn save_resource_relation(
        &self,
        input: ResourceRelation,
        resolver: &dyn ResourceResolver,
    ) -> Result<()> {
        self.save_resource_relations(vec![input], resolver)
    }
    pub fn save_resource_relations(
        &self,
        inputs: Vec<ResourceRelation>,
        resolver: &dyn ResourceResolver,
    ) -> Result<()> {
        if inputs.is_empty() || inputs.len() > 100 {
            return Err(invalid("resource_relation_invalid"));
        }
        let tx = self.connection.unchecked_transaction()?;
        for input in inputs {
            self.write_resource_relation(input, resolver)?;
        }
        tx.commit()?;
        Ok(())
    }
    pub(super) fn write_resource_relation(
        &self,
        input: ResourceRelation,
        resolver: &dyn ResourceResolver,
    ) -> Result<()> {
        uuid::Uuid::parse_str(&input.id).map_err(|_| invalid("resource_relation_invalid"))?;
        if input.source == input.target
            || !valid_code(&input.kind)
            || input.label.chars().count() > 120
            || input.label.chars().any(char::is_control)
        {
            return Err(invalid("resource_relation_invalid"));
        }
        self.validate_case_resource(&input.case_id, &input.source, resolver)?;
        self.validate_case_resource(&input.case_id, &input.target, resolver)?;
        let owner: Option<String> = self
            .connection
            .query_row(
                "SELECT case_id FROM resource_relations WHERE id=?1",
                [&input.id],
                |r| r.get(0),
            )
            .optional()?;
        if owner.as_ref().is_some_and(|id| id != &input.case_id) {
            return Err(invalid("resource_reference_invalid"));
        }
        let duplicate:bool=self.connection.query_row("SELECT EXISTS(SELECT 1 FROM resource_relations WHERE case_id=?1 AND source_kind=?2 AND source_id=?3 AND target_kind=?4 AND target_id=?5 AND kind=?6 AND id!=?7)",params![input.case_id,input.source.kind,input.source.id,input.target.kind,input.target.id,input.kind,input.id],|r|r.get(0))?;
        if duplicate {
            return Err(invalid("resource_relation_exists"));
        }
        self.connection.execute("INSERT INTO resource_relations(id,case_id,source_kind,source_id,target_kind,target_id,kind,label) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(id) DO UPDATE SET source_kind=excluded.source_kind,source_id=excluded.source_id,target_kind=excluded.target_kind,target_id=excluded.target_id,kind=excluded.kind,label=excluded.label",
            params![input.id,input.case_id,input.source.kind,input.source.id,input.target.kind,input.target.id,input.kind,input.label.trim()])?;
        Ok(())
    }

    pub fn delete_resource_relation(&self, case_id: &str, id: &str) -> Result<()> {
        self.active_case(case_id)?;
        self.connection.execute(
            "DELETE FROM resource_relations WHERE case_id=?1 AND id=?2",
            params![case_id, id],
        )?;
        Ok(())
    }
}
