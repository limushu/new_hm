//! Case resource services. Native assembly may supply a trusted resolver for new modules.
use hm_core::case_system::{
    ResourceMetadata, ResourceRegistry, ResourceRelation, ResourceResolver,
};
use hm_core::{Result, Store};

pub struct CaseSystem {
    resolver: Box<dyn ResourceResolver>,
}

impl Default for CaseSystem {
    fn default() -> Self {
        Self::new(Box::new(ResourceRegistry::default()))
    }
}

impl CaseSystem {
    pub fn apply_properties(
        &self,
        store: &Store,
        input: hm_core::case_system::ApplyObjectProperties,
    ) -> Result<()> {
        store.apply_object_properties(input, self.resolver.as_ref())
    }

    pub fn new(resolver: Box<dyn ResourceResolver>) -> Self {
        Self { resolver }
    }
    pub fn annotate(&self, store: &Store, input: ResourceMetadata) -> Result<()> {
        store.save_resource_metadata(input, self.resolver.as_ref())
    }
    pub fn relate(&self, store: &Store, input: ResourceRelation) -> Result<()> {
        store.save_resource_relation(input, self.resolver.as_ref())
    }
}
