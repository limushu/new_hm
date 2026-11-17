//! A local logout/background/disable invalidates work already waiting on I/O.
use hm_runtime::platform::{
    CloudIdentity, DriverError, DriverResult, ReplicaIdentity, SyncDriver, SyncHead, SyncSession,
    SyncSupport,
};
use std::{
    io::{self, Read},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};
#[derive(Clone, Default)]
pub struct SyncEpoch(Arc<AtomicU64>);
impl SyncEpoch {
    pub fn current(&self) -> u64 {
        self.0.load(Ordering::Acquire)
    }
    pub fn invalidate(&self) {
        self.0.fetch_add(1, Ordering::AcqRel);
    }
    pub fn check(&self, expected: u64) -> DriverResult<()> {
        if self.current() == expected {
            Ok(())
        } else {
            Err(DriverError::invalid_state("sync_interrupted"))
        }
    }
    pub fn guard(&self, driver: Arc<dyn SyncDriver>) -> Box<dyn SyncDriver> {
        Box::new(GuardedDriver {
            driver,
            epoch: self.clone(),
            expected: self.current(),
        })
    }
}
struct GuardedDriver {
    driver: Arc<dyn SyncDriver>,
    epoch: SyncEpoch,
    expected: u64,
}
impl SyncDriver for GuardedDriver {
    fn provider(&self) -> Option<&'static str> {
        self.driver.provider()
    }
    fn support(&self) -> DriverResult<SyncSupport> {
        self.driver.support()
    }
    fn storage_account(&self) -> DriverResult<CloudIdentity> {
        self.epoch.check(self.expected)?;
        self.driver.storage_account()
    }
    fn open(&self, identity: &ReplicaIdentity) -> DriverResult<Box<dyn SyncSession>> {
        self.epoch.check(self.expected)?;
        let session = self.driver.open(identity)?;
        self.epoch.check(self.expected)?;
        Ok(Box::new(GuardedSession {
            session,
            epoch: self.epoch.clone(),
            expected: self.expected,
        }))
    }
}
struct GuardedReader<T> {
    source: T,
    epoch: SyncEpoch,
    expected: u64,
}
impl<T: Read> Read for GuardedReader<T> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        // `copy` and `read_to_end` retry Interrupted. Cancellation is terminal.
        if self.epoch.current() != self.expected {
            return Err(io::Error::new(
                io::ErrorKind::ConnectionAborted,
                "sync_interrupted",
            ));
        }
        self.source.read(buf)
    }
}
struct GuardedSession {
    session: Box<dyn SyncSession>,
    epoch: SyncEpoch,
    expected: u64,
}
impl SyncSession for GuardedSession {
    fn identity(&self) -> &ReplicaIdentity {
        self.session.identity()
    }
    fn head(&mut self) -> DriverResult<Option<SyncHead>> {
        self.epoch.check(self.expected)?;
        self.session.head()
    }
    fn has_blob(&mut self, digest: &str) -> DriverResult<bool> {
        self.epoch.check(self.expected)?;
        self.session.has_blob(digest)
    }
    fn put_blob(&mut self, digest: &str, source: &mut dyn Read) -> DriverResult<u64> {
        self.epoch.check(self.expected)?;
        self.session.put_blob(
            digest,
            &mut GuardedReader {
                source,
                epoch: self.epoch.clone(),
                expected: self.expected,
            },
        )
    }
    fn get_blob(&mut self, digest: &str) -> DriverResult<Box<dyn Read>> {
        self.epoch.check(self.expected)?;
        let source = self.session.get_blob(digest)?;
        Ok(Box::new(GuardedReader {
            source,
            epoch: self.epoch.clone(),
            expected: self.expected,
        }))
    }
    fn publish(
        &mut self,
        expected: Option<&SyncHead>,
        revision: &str,
    ) -> DriverResult<Option<SyncHead>> {
        self.epoch.check(self.expected)?;
        self.session.publish(expected, revision)
    }
}
