//! Private native speech bridge. Only the Rust driver invokes its commands.
#[cfg(target_os = "ios")]
mod ios;
#[cfg(target_os = "ios")]
pub use ios::{driver, init};
