//! Private native document-provider bridge; business code receives streams.
#[cfg(any(target_os = "ios", target_os = "android"))]
mod mobile;
#[cfg(any(target_os = "ios", target_os = "android"))]
pub use mobile::{driver, init};
