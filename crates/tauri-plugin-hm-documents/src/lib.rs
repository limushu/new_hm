//! Private native document-provider bridge; business code receives streams.
#[cfg(target_os = "ios")]
mod ios;
#[cfg(target_os = "ios")]
pub use ios::{driver, init};
