use super::{
    normalized_resource_tags, Importance, ResourceMetadata, ResourceRef, ResourceResolver,
};
use crate::{Result, Store};
use rusqlite::params;

impl Store {
    pub fn resource_metadata(&self) -> Result<Vec<ResourceMetadata>> {
        let values = self.connection.prepare("SELECT case_id,resource_kind,resource_id,importance,tags_json FROM resource_metadata ORDER BY case_id,resource_kind,resource_id")?
            .query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
            .into_iter()
            .map(|(case_id, kind, id, importance, tags)| {
                Ok(ResourceMetadata {
                    case_id,
                    resource: ResourceRef { kind, id },
                    importance: if importance == "important" {
                        Importance::Important
                    } else {
                        Importance::Normal
                    },
                    tags: serde_json::from_str(&tags)?,
                })
            })
            .collect()
    }

    pub fn save_resource_metadata(
        &self,
        input: ResourceMetadata,
        resolver: &dyn ResourceResolver,
    ) -> Result<()> {
        let tx = self.connection.unchecked_transaction()?;
        self.validate_case_resource(&input.case_id, &input.resource, resolver)?;
        let tags = normalized_resource_tags(&input.tags)?;
        let importance = match input.importance {
            Importance::Normal => "normal",
            Importance::Important => "important",
        };
        tx.execute("INSERT INTO resource_metadata(case_id,resource_kind,resource_id,importance,tags_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(case_id,resource_kind,resource_id) DO UPDATE SET importance=excluded.importance,tags_json=excluded.tags_json",
            params![input.case_id,input.resource.kind,input.resource.id,importance,serde_json::to_string(&tags)?])?;
        tx.commit()?;
        Ok(())
    }
}
