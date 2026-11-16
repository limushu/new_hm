//! Native authorization and device-private credential storage. No secrets cross UI IPC.
use super::{DriverError, DriverResult};

pub trait IdentityDriver: Send + Sync {
    fn installed(&self) -> bool;
    fn load(&self, project: &str) -> DriverResult<Option<String>>;
    /// Replace atomically; a failed write must leave the previous credential intact.
    fn save(&self, project: &str, credential: Option<&str>) -> DriverResult<()>;
    /// Use the system authorization browser, with its own cancel/timeout lifecycle.
    fn authorize(&self, url: &str, callback: &str) -> DriverResult<String>;
}

pub struct UnavailableIdentity;
impl IdentityDriver for UnavailableIdentity {
    fn installed(&self) -> bool {
        false
    }
    fn load(&self, _: &str) -> DriverResult<Option<String>> {
        Err(DriverError::unsupported("account_login"))
    }
    fn save(&self, _: &str, _: Option<&str>) -> DriverResult<()> {
        Err(DriverError::unsupported("account_login"))
    }
    fn authorize(&self, _: &str, _: &str) -> DriverResult<String> {
        Err(DriverError::unsupported("account_login"))
    }
}
