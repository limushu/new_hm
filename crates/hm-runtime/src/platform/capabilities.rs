use super::{DriverError, DriverResult};
use crate::{Availability, Capability, RuntimeManifest};

impl RuntimeManifest {
    /// The native boundary enforces the same capabilities advertised to the UI.
    pub fn require(&self, capability: Capability) -> DriverResult<()> {
        if self
            .subsystems
            .iter()
            .any(|s| s.state == Availability::Ready && s.capabilities.contains(&capability))
        {
            Ok(())
        } else {
            Err(DriverError::unsupported(&format!("{capability:?}")))
        }
    }
}
