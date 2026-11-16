//! Private native identity bridge. UI commands never receive credential payloads.
#[cfg(target_os = "ios")]
mod ios;
#[cfg(target_os = "ios")]
pub use ios::{driver, init};
