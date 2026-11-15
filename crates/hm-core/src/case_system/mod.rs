//! Shared resource identities and annotations. Resource bodies remain in their owning modules.
mod metadata;
mod relations;
mod resources;

pub use resources::{BuiltinResources, ResourceProvider, ResourceRegistry, ResourceResolver};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResourceRef {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Importance {
    #[default]
    Normal,
    Important,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMetadata {
    pub case_id: String,
    pub resource: ResourceRef,
    pub importance: Importance,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRelation {
    pub id: String,
    pub case_id: String,
    pub source: ResourceRef,
    pub target: ResourceRef,
    /// Stable, untranslated relation code; user-defined meaning belongs in label.
    pub kind: String,
    pub label: String,
}

fn invalid(code: &str) -> crate::Error {
    crate::Error::Validation(code.into())
}

fn valid_code(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"._-".contains(&c))
}

pub fn normalized_resource_tags(values: &[String]) -> crate::Result<Vec<String>> {
    if values.len() > 20 {
        return Err(invalid("resource_tags_invalid"));
    }
    let mut result = Vec::new();
    for value in values {
        let value = value.trim();
        if value.is_empty() {
            continue;
        }
        if value.chars().count() > 40 || value.chars().any(char::is_control) {
            return Err(invalid("resource_tags_invalid"));
        }
        if !result
            .iter()
            .any(|v: &String| v.to_lowercase() == value.to_lowercase())
        {
            result.push(value.to_owned());
        }
    }
    Ok(result)
}
