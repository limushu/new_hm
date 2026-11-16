//! Private iOS CloudKit transport. Does not implement login, case rules or conflict policy.
#[cfg(target_os = "ios")]
mod ios;
#[cfg(target_os = "ios")]
pub use ios::{driver, init};
