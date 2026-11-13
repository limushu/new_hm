//! Mobile native adapters; missing capabilities fail explicitly.
#[cfg(not(target_os = "ios"))]
pub mod documents;
pub use hm_runtime::SandboxPlatform;
