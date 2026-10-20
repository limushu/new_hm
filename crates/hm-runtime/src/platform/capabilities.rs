use crate::{Availability, Capability, RuntimeManifest};

impl RuntimeManifest {
    /// The native boundary enforces the same capabilities advertised to the UI.
    pub fn require(&self, capability: Capability) -> Result<(), String> {
        if self
            .subsystems
            .iter()
            .any(|s| s.state == Availability::Ready && s.capabilities.contains(&capability))
        {
            Ok(())
        } else {
            Err(format!("当前平台尚不支持此能力：{capability:?}"))
        }
    }
}
