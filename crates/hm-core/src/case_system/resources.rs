use super::{invalid, valid_code, ResourceRef};
use crate::{Result, Store};
use rusqlite::params;

/// Trusted application modules implement ownership validation for additional resource kinds.
/// Implementations must check existence, lifecycle and case ownership, never just an ID prefix.
pub trait ResourceResolver: Send + Sync {
    fn validate(&self, store: &Store, case_id: &str, resource: &ResourceRef) -> Result<()>;
}

pub trait ResourceProvider: ResourceResolver {
    fn kinds(&self) -> &[&str];
}

pub struct BuiltinResources;
impl ResourceProvider for BuiltinResources {
    fn kinds(&self) -> &[&str] {
        &[
            "case",
            "proceeding",
            "milestone",
            "event",
            "task",
            "record",
            "material",
            "ledger",
            "party",
            "contact",
        ]
    }
}
impl ResourceResolver for BuiltinResources {
    fn validate(&self, store: &Store, case_id: &str, resource: &ResourceRef) -> Result<()> {
        let sql = match resource.kind.as_str() {
            "case" => "SELECT EXISTS(SELECT 1 FROM cases WHERE id=?2 AND id=?1 AND deleted_at IS NULL)",
            "proceeding" => "SELECT EXISTS(SELECT 1 FROM proceedings WHERE id=?2 AND case_id=?1)",
            "milestone" => "SELECT EXISTS(SELECT 1 FROM case_events WHERE id=?2 AND case_id=?1)",
            "event" => "SELECT EXISTS(SELECT 1 FROM calendar_events WHERE id=?2 AND case_id=?1)",
            "task" => "SELECT EXISTS(SELECT 1 FROM tasks WHERE id=?2 AND case_id=?1)",
            "record" => "SELECT EXISTS(SELECT 1 FROM work_records WHERE id=?2 AND case_id=?1 AND deleted_at IS NULL)",
            "material" => "SELECT EXISTS(SELECT 1 FROM materials WHERE id=?2 AND case_id=?1 AND deleted_at IS NULL)",
            "ledger" => "SELECT EXISTS(SELECT 1 FROM ledger_entries WHERE id=?2 AND case_id=?1)",
            "party" => "SELECT EXISTS(SELECT 1 FROM case_parties WHERE id=?2 AND case_id=?1)",
            // The directory is global; a case-scoped relation explicitly associates a contact.
            "contact" => "SELECT EXISTS(SELECT 1 FROM contacts WHERE id=?2 AND ?1 IS NOT NULL)",
            _ => return Err(invalid("resource_kind_unsupported")),
        };
        let exists: bool = store
            .connection
            .query_row(sql, params![case_id, resource.id], |r| r.get(0))?;
        if !exists {
            return Err(invalid("resource_reference_invalid"));
        }
        Ok(())
    }
}

/// Registered native modules dispatch by a stable kind, without changing shared persistence.
pub struct ResourceRegistry {
    providers: Vec<Box<dyn ResourceProvider>>,
}
impl Default for ResourceRegistry {
    fn default() -> Self {
        Self {
            providers: vec![Box::new(BuiltinResources)],
        }
    }
}
impl ResourceRegistry {
    pub fn register(&mut self, provider: Box<dyn ResourceProvider>) -> Result<()> {
        let mut seen = std::collections::HashSet::new();
        for kind in provider.kinds() {
            if !valid_code(kind)
                || !seen.insert(*kind)
                || self.providers.iter().any(|p| p.kinds().contains(kind))
            {
                return Err(invalid("resource_module_conflict"));
            }
        }
        if seen.is_empty() {
            return Err(invalid("resource_module_conflict"));
        }
        self.providers.push(provider);
        Ok(())
    }
}
impl ResourceResolver for ResourceRegistry {
    fn validate(&self, store: &Store, case_id: &str, resource: &ResourceRef) -> Result<()> {
        self.providers
            .iter()
            .find(|p| p.kinds().contains(&resource.kind.as_str()))
            .ok_or_else(|| invalid("resource_kind_unsupported"))?
            .validate(store, case_id, resource)
    }
}

impl Store {
    pub fn validate_case_resource(
        &self,
        case_id: &str,
        resource: &ResourceRef,
        resolver: &dyn ResourceResolver,
    ) -> Result<()> {
        self.active_case(case_id)?;
        if !valid_code(&resource.kind)
            || resource.id.is_empty()
            || resource.id.len() > 200
            || resource.id.chars().any(char::is_control)
        {
            return Err(invalid("resource_reference_invalid"));
        }
        resolver.validate(self, case_id, resource)
    }
}
