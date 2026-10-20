//! External documents are scoped resources, not portable filesystem paths.
use super::DriverResult;
use std::io::Read;

/// The driver retains any provider grant for the lifetime of this object.
/// Dropping it releases the stream and platform-specific access resources.
pub trait Document: Send {
    fn name(&self) -> &str;
    /// Open from the beginning; retrying an archive must not lose its prefix.
    /// The borrowed reader cannot outlive the provider grant.
    fn open(&mut self) -> DriverResult<Box<dyn Read + '_>>;
}

/// Blocking operations run on the host's worker pool, never its UI thread.
pub trait DocumentDriver: Send + Sync {
    /// None means user cancellation, not failure.
    fn pick(&self, multiple: bool) -> DriverResult<Option<Vec<Box<dyn Document>>>>;
    /// None means the destination picker was cancelled.
    fn export(&self, name: &str, source: &mut dyn Read) -> DriverResult<Option<u64>>;
}
