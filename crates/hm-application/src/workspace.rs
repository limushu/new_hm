//! Observe durable business writes once, independent of the calling IPC/page.
use hm_core::Store;
use hm_runtime::platform::{DriverError, DriverResult};
use std::{
    ops::{Deref, DerefMut},
    sync::{Mutex, MutexGuard},
};
pub struct WorkspaceCell {
    store: Mutex<Store>,
    changed: Box<dyn Fn() + Send + Sync>,
}
impl WorkspaceCell {
    pub fn new(store: Store, changed: impl Fn() + Send + Sync + 'static) -> Self {
        Self {
            store: Mutex::new(store),
            changed: Box::new(changed),
        }
    }
    pub fn lock(&self) -> DriverResult<WorkspaceGuard<'_>> {
        self.store
            .lock()
            .map(|guard| self.observe(guard))
            .map_err(|_| DriverError::invalid_state("storage_unavailable"))
    }
    pub fn try_lock(&self) -> DriverResult<WorkspaceGuard<'_>> {
        self.store
            .try_lock()
            .map(|guard| self.observe(guard))
            .map_err(|_| DriverError::invalid_state("storage_unavailable"))
    }
    fn observe<'a>(&'a self, guard: MutexGuard<'a, Store>) -> WorkspaceGuard<'a> {
        WorkspaceGuard {
            before: guard.sync_generation(),
            guard: Some(guard),
            changed: &self.changed,
            forced: false,
        }
    }
}
pub struct WorkspaceGuard<'a> {
    before: u64,
    guard: Option<MutexGuard<'a, Store>>,
    changed: &'a (dyn Fn() + Send + Sync),
    forced: bool,
}
impl WorkspaceGuard<'_> {
    /// Replacing a database can reset its connection-local generation counter.
    pub fn mark_changed(&mut self) {
        self.forced = true;
    }
}
impl Deref for WorkspaceGuard<'_> {
    type Target = Store;
    fn deref(&self) -> &Store {
        self.guard.as_ref().expect("live workspace guard")
    }
}
impl DerefMut for WorkspaceGuard<'_> {
    fn deref_mut(&mut self) -> &mut Store {
        self.guard.as_mut().expect("live workspace guard")
    }
}
impl Drop for WorkspaceGuard<'_> {
    fn drop(&mut self) {
        let modified = self.forced
            || self
                .guard
                .as_ref()
                .is_some_and(|s| s.sync_generation() != self.before);
        drop(self.guard.take()); // System callbacks must never own the business lock.
        if modified {
            (self.changed)();
        }
    }
}
