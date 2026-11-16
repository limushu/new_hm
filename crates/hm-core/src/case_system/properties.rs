use super::{
    invalid, ObjectProperty, ObjectPropertyInput, PropertyKind, ResourceRef, ResourceResolver,
};
use crate::{Result, Store};
use rusqlite::{params, OptionalExtension};

fn validate(property: &mut ObjectProperty) -> Result<()> {
    uuid::Uuid::parse_str(&property.id).map_err(|_| invalid("object_property_invalid"))?;
    property.name = property.name.trim().to_owned();
    if property.name.is_empty()
        || property.name.chars().count() > 60
        || property.name.chars().any(char::is_control)
    {
        return Err(invalid("object_property_invalid"));
    }
    if property.options.len() > 50 {
        return Err(invalid("object_property_invalid"));
    }
    let mut options = Vec::new();
    for option in &property.options {
        let option = option.trim();
        if option.is_empty()
            || option.chars().count() > 80
            || option.chars().any(char::is_control)
            || options.iter().any(|v: &String| v == option)
        {
            return Err(invalid("object_property_invalid"));
        }
        options.push(option.to_owned());
    }
    property.options = options;
    if !matches!(
        property.kind,
        PropertyKind::Select | PropertyKind::MultiSelect
    ) && !property.options.is_empty()
    {
        return Err(invalid("object_property_invalid"));
    }
    if property.value.is_null() {
        return Ok(());
    }
    let valid = match property.kind {
        PropertyKind::Text => property
            .value
            .as_str()
            .is_some_and(|s| s.chars().count() <= 20_000),
        PropertyKind::Number => property.value.is_number(),
        PropertyKind::Checkbox => property.value.is_boolean(),
        PropertyKind::Date => property
            .value
            .as_str()
            .is_some_and(|s| crate::people::checked_date(s).is_ok()),
        PropertyKind::Select => property
            .value
            .as_str()
            .is_some_and(|s| property.options.iter().any(|o| o == s)),
        PropertyKind::MultiSelect => property.value.as_array().is_some_and(|values| {
            values.len() <= 50
                && values.iter().all(|v| {
                    v.as_str()
                        .is_some_and(|s| property.options.iter().any(|o| o == s))
                })
                && values
                    .iter()
                    .enumerate()
                    .all(|(i, v)| !values[..i].contains(v))
        }),
        // Associated objects use resource_relations with kind property.<id>, never copies of refs.
        PropertyKind::Relation => false,
    };
    if !valid {
        return Err(invalid("object_property_value_invalid"));
    }
    Ok(())
}

impl Store {
    pub fn save_object_property(
        &self,
        mut input: ObjectPropertyInput,
        resolver: &dyn ResourceResolver,
    ) -> Result<()> {
        validate(&mut input.property)?;
        let tx = self.connection.unchecked_transaction()?;
        self.validate_case_resource(&input.case_id, &input.resource, resolver)?;
        if let Some(ref targets) = input.related {
            if input.property.kind != PropertyKind::Relation || targets.len() > 100 {
                return Err(invalid("object_property_invalid"));
            }
            for target in targets {
                if target == &input.resource {
                    return Err(invalid("resource_relation_invalid"));
                }
                self.validate_case_resource(&input.case_id, target, resolver)?;
            }
        }
        let property_id = input.property.id.clone();
        let property_name = input.property.name.clone();
        let json: Option<String>=tx.query_row("SELECT properties_json FROM resource_metadata WHERE case_id=?1 AND resource_kind=?2 AND resource_id=?3",params![input.case_id,input.resource.kind,input.resource.id],|r|r.get(0)).optional()?;
        let mut fields: Vec<ObjectProperty> =
            serde_json::from_str(json.as_deref().unwrap_or("[]"))?;
        if fields.iter().any(|f| {
            f.id != input.property.id && f.name.to_lowercase() == input.property.name.to_lowercase()
        }) {
            return Err(invalid("object_property_exists"));
        }
        if let Some(index) = fields.iter().position(|f| f.id == input.property.id) {
            if fields[index].kind == PropertyKind::Relation
                && input.property.kind != PropertyKind::Relation
            {
                tx.execute("DELETE FROM resource_relations WHERE case_id=?1 AND source_kind=?2 AND source_id=?3 AND kind=?4",params![input.case_id,input.resource.kind,input.resource.id,format!("property.{}",input.property.id)])?;
            }
            fields[index] = input.property;
        } else {
            if fields.len() >= 50 {
                return Err(invalid("object_property_limit"));
            }
            fields.push(input.property);
        }
        tx.execute("INSERT INTO resource_metadata(case_id,resource_kind,resource_id,properties_json) VALUES(?1,?2,?3,?4) ON CONFLICT(case_id,resource_kind,resource_id) DO UPDATE SET properties_json=excluded.properties_json",params![input.case_id,input.resource.kind,input.resource.id,serde_json::to_string(&fields)?])?;
        if let Some(targets) = input.related {
            let relation_kind = format!("property.{property_id}");
            let previous = self
                .resource_relations()?
                .into_iter()
                .filter(|r| {
                    r.case_id == input.case_id
                        && r.source == input.resource
                        && r.kind == relation_kind
                })
                .collect::<Vec<_>>();
            for old in &previous {
                if !targets.contains(&old.target) {
                    tx.execute("DELETE FROM resource_relations WHERE id=?1", [&old.id])?;
                }
            }
            let mut linked = Vec::new();
            for target in targets {
                if linked.contains(&target) {
                    continue;
                }
                linked.push(target.clone());
                let id = previous
                    .iter()
                    .find(|r| r.target == target)
                    .map(|r| r.id.clone())
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                self.write_resource_relation(
                    super::ResourceRelation {
                        id,
                        case_id: input.case_id.clone(),
                        source: input.resource.clone(),
                        target,
                        kind: relation_kind.clone(),
                        label: property_name.clone(),
                    },
                    resolver,
                )?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn delete_object_property(
        &self,
        case_id: &str,
        resource: &ResourceRef,
        id: &str,
        resolver: &dyn ResourceResolver,
    ) -> Result<()> {
        let tx = self.connection.unchecked_transaction()?;
        self.validate_case_resource(case_id, resource, resolver)?;
        let json: Option<String>=tx.query_row("SELECT properties_json FROM resource_metadata WHERE case_id=?1 AND resource_kind=?2 AND resource_id=?3",params![case_id,resource.kind,resource.id],|r|r.get(0)).optional()?;
        let mut fields: Vec<ObjectProperty> =
            serde_json::from_str(json.as_deref().unwrap_or("[]"))?;
        fields.retain(|f| f.id != id);
        tx.execute("UPDATE resource_metadata SET properties_json=?4 WHERE case_id=?1 AND resource_kind=?2 AND resource_id=?3",params![case_id,resource.kind,resource.id,serde_json::to_string(&fields)?])?;
        tx.execute("DELETE FROM resource_relations WHERE case_id=?1 AND source_kind=?2 AND source_id=?3 AND kind=?4",params![case_id,resource.kind,resource.id,format!("property.{id}")])?;
        tx.commit()?;
        Ok(())
    }
}
