//! Private native bridge. Only Rust drivers invoke it; no frontend commands.
#[cfg(target_os = "ios")]
mod ios;
#[cfg(target_os = "ios")]
pub use ios::{driver, init};
