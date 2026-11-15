use super::{
    normalized_resource_tags, Importance, ResourceMetadata, ResourceRef, ResourceResolver,
};
use crate::{Result, Store};
use rusqlite::params;

impl Store {
    pub fn resource_metadata(&self) -> Result<Vec<ResourceMetadata>> {
        let values = self.connection.prepare("SELECT case_id,resource_kind,resource_id,importance,tags_json,properties_json FROM resource_metadata ORDER BY case_id,resource_kind,resource_id")?
            .query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,String>(5)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
            .into_iter()
            .map(|(case_id, kind, id, importance, tags, properties)| {
                Ok(ResourceMetadata {
                    case_id,
                    resource: ResourceRef { kind, id },
                    importance: if importance == "important" {
                        Importance::Important
                    } else {
                        Importance::Normal
                    },
                    tags: serde_json::from_str(&tags)?,
                    properties: serde_json::from_str(&properties)?,
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

impl Store {
    /// Atomically annotate a creation result and its node references. The resource bodies
    /// are already durable; callers may retry this idempotently without importing again.
    pub fn apply_object_properties(
        &self,
        input: super::ApplyObjectProperties,
        resolver: &dyn ResourceResolver,
    ) -> Result<()> {
        if input.resources.len() > 500 || input.nodes.len() > 30 {
            return Err(super::invalid("resource_reference_invalid"));
        }
        let tags = serde_json::to_string(&normalized_resource_tags(&input.tags)?)?;
        let importance = match input.importance {
            Importance::Normal => "normal",
            Importance::Important => "important",
        };
        let tx = self.connection.unchecked_transaction()?;
        self.active_case(&input.case_id)?;
        for node in &input.nodes {
            self.validate_case_resource(&input.case_id, node, resolver)?;
        }
        for resource in &input.resources {
            self.validate_case_resource(&input.case_id, resource, resolver)?;
            tx.execute("INSERT INTO resource_metadata(case_id,resource_kind,resource_id,importance,tags_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(case_id,resource_kind,resource_id) DO UPDATE SET importance=excluded.importance,tags_json=excluded.tags_json",params![input.case_id,resource.kind,resource.id,importance,tags])?;
            for node in &input.nodes {
                if node == resource {
                    return Err(super::invalid("resource_relation_invalid"));
                }
                tx.execute("INSERT OR IGNORE INTO resource_relations(id,case_id,source_kind,source_id,target_kind,target_id,kind,label) VALUES(?1,?2,?3,?4,?5,?6,'in_node','')",params![uuid::Uuid::new_v4().to_string(),input.case_id,resource.kind,resource.id,node.kind,node.id])?;
            }
        }
        tx.commit()?;
        Ok(())
    }
}
